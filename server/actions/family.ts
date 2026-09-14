import { createHash, randomInt } from "node:crypto";
import { and, count, eq, gt, isNull, or } from "drizzle-orm";
import type { FamilyLink, FamilyOverview, InviteCreated } from "../../src/lib/contracts.js";
import { linkInvites, parentChildLinks, users, type LinkKind, type User } from "../../src/lib/schema.js";
import { recordAudit } from "../audit.js";
import type { Database } from "../db.js";
import { errors } from "../http.js";
import { toBrief } from "../presenters.js";
import { enforceRateLimit } from "../rate-limit.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
const MAX_ACTIVE_INVITES = 5;

function normaliseCode(code: string): string {
  return code.replace(/-/g, "").toUpperCase();
}

function hashCode(code: string): string {
  return createHash("sha256").update(normaliseCode(code)).digest("hex");
}

function generateCode(): string {
  let raw = "";
  for (let i = 0; i < 8; i++) raw += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** Which roles may redeem each kind of invite. A wali is also a mahram. */
const REDEEMER_ROLES: Record<LinkKind, User["role"][]> = {
  WALI: ["PARENT"],
  MAHRAM: ["MAHRAM", "PARENT"],
};

export async function createInvite(db: Database, user: User, kind: LinkKind): Promise<InviteCreated> {
  if (user.role !== "SOLO" && user.role !== "DEPENDENT") {
    throw errors.forbidden("Only seekers can invite a wali or mahram.", "NOT_A_SEEKER");
  }
  const [active] = await db
    .select({ n: count() })
    .from(linkInvites)
    .where(and(eq(linkInvites.childId, user.id), isNull(linkInvites.usedAt), gt(linkInvites.expiresAt, new Date())));
  if ((active?.n ?? 0) >= MAX_ACTIVE_INVITES) {
    throw errors.conflict("You already have 5 unused invite codes. Wait for them to be used or expire.", "INVITE_LIMIT");
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  await db.insert(linkInvites).values({ childId: user.id, kind, codeHash: hashCode(code), expiresAt });
  return { code, kind, expiresAt: expiresAt.toISOString() };
}

export async function redeemInvite(db: Database, user: User, code: string): Promise<FamilyLink> {
  await enforceRateLimit(db, `redeem:${user.id}`, 10, 900, "Too many invite attempts. Try again in 15 minutes.");
  const invalid = errors.badRequest("That invite code is invalid or has expired.", "INVITE_INVALID");
  const codeHash = hashCode(code);

  const [invite] = await db
    .select()
    .from(linkInvites)
    .where(and(eq(linkInvites.codeHash, codeHash), isNull(linkInvites.usedAt), gt(linkInvites.expiresAt, new Date())))
    .limit(1);
  if (!invite) throw invalid;
  if (invite.childId === user.id) throw errors.badRequest("You cannot redeem your own invite.", "INVITE_SELF");
  if (!REDEEMER_ROLES[invite.kind].includes(user.role)) {
    throw errors.forbidden(
      invite.kind === "WALI"
        ? "Only accounts registered as Parent / Wali can accept a wali invite."
        : "Only Mahram or Parent / Wali accounts can accept a mahram invite.",
      "INVITE_ROLE_MISMATCH",
    );
  }

  const [claimed] = await db
    .update(linkInvites)
    .set({ usedAt: new Date(), usedBy: user.id })
    .where(and(eq(linkInvites.id, invite.id), isNull(linkInvites.usedAt)))
    .returning({ id: linkInvites.id });
  if (!claimed) throw invalid;

  await db
    .insert(parentChildLinks)
    .values({ parentId: user.id, childId: invite.childId, kind: invite.kind })
    .onConflictDoNothing({ target: [parentChildLinks.parentId, parentChildLinks.childId] });

  const [link] = await db
    .select({ link: parentChildLinks, child: users })
    .from(parentChildLinks)
    .innerJoin(users, eq(users.id, parentChildLinks.childId))
    .where(and(eq(parentChildLinks.parentId, user.id), eq(parentChildLinks.childId, invite.childId)))
    .limit(1);
  if (!link) throw new Error("Link was not created");

  await recordAudit(db, {
    actorId: user.id,
    targetId: invite.childId,
    action: "FAMILY_LINKED",
    metadata: { kind: link.link.kind, linkId: link.link.id },
  });

  return {
    linkId: link.link.id,
    kind: link.link.kind,
    person: toBrief(link.child),
    createdAt: link.link.createdAt.toISOString(),
  };
}

export async function getFamilyOverview(db: Database, user: User): Promise<FamilyOverview> {
  const guardianRows = await db
    .select({ link: parentChildLinks, person: users })
    .from(parentChildLinks)
    .innerJoin(users, eq(users.id, parentChildLinks.parentId))
    .where(eq(parentChildLinks.childId, user.id));

  const dependentRows = await db
    .select({ link: parentChildLinks, person: users })
    .from(parentChildLinks)
    .innerJoin(users, eq(users.id, parentChildLinks.childId))
    .where(eq(parentChildLinks.parentId, user.id));

  const invites = await db
    .select({ id: linkInvites.id, kind: linkInvites.kind, expiresAt: linkInvites.expiresAt })
    .from(linkInvites)
    .where(and(eq(linkInvites.childId, user.id), isNull(linkInvites.usedAt), gt(linkInvites.expiresAt, new Date())));

  const toLink = (row: { link: typeof parentChildLinks.$inferSelect; person: User }): FamilyLink => ({
    linkId: row.link.id,
    kind: row.link.kind,
    person: toBrief(row.person),
    createdAt: row.link.createdAt.toISOString(),
  });

  return {
    guardians: guardianRows.map(toLink),
    dependents: dependentRows.map(toLink),
    activeInvites: invites.map((i) => ({ id: i.id, kind: i.kind, expiresAt: i.expiresAt.toISOString() })),
  };
}

export async function revokeInvite(db: Database, user: User, inviteId: string): Promise<void> {
  const [revoked] = await db
    .update(linkInvites)
    .set({ expiresAt: new Date() })
    .where(and(eq(linkInvites.id, inviteId), eq(linkInvites.childId, user.id), isNull(linkInvites.usedAt)))
    .returning({ id: linkInvites.id });
  if (!revoked) throw errors.notFound("Invite not found.");
}

/** Either side of a link may remove it. */
export async function removeLink(db: Database, user: User, linkId: string): Promise<void> {
  const [removed] = await db
    .delete(parentChildLinks)
    .where(
      and(
        eq(parentChildLinks.id, linkId),
        or(eq(parentChildLinks.parentId, user.id), eq(parentChildLinks.childId, user.id)),
      ),
    )
    .returning();
  if (!removed) throw errors.notFound("Link not found.");

  await recordAudit(db, {
    actorId: user.id,
    targetId: removed.parentId === user.id ? removed.childId : removed.parentId,
    action: "FAMILY_UNLINKED",
    metadata: { kind: removed.kind, parentId: removed.parentId, childId: removed.childId },
  });
}
