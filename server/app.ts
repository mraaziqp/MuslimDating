import express, { type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  accountActionSchema,
  adminConnectionsQuerySchema,
  assignRoleSchema,
  auditQuerySchema,
  connectionDecisionSchema,
  createConnectionSchema,
  createInviteSchema,
  loginSchema,
  onboardingSchema,
  photoConsentSchema,
  photoUploadSchema,
  profileUpdateSchema,
  readinessSubmissionSchema,
  redeemInviteSchema,
  registerSchema,
  removePhotoSchema,
  reportSchema,
  reportUpdateSchema,
  sendMessageSchema,
  terminateConnectionSchema,
  userDirectoryQuerySchema,
  type AuthResponse,
} from "../src/lib/contracts.js";
import * as admin from "./actions/admin.js";
import { getConversationTranscript, getUserDetail, listAllConnections } from "./actions/admin-oversight.js";
import { getChat, sendMessage } from "./actions/chat.js";
import { cleanupStaleConnections } from "./actions/cron.js";
import { createInvite, getFamilyOverview, redeemInvite, removeLink, revokeInvite } from "./actions/family.js";
import {
  createConnection,
  decideConnection,
  getFeed,
  listConnections,
  setPhotoConsent,
  terminateConnection,
  withdrawConnection,
} from "./actions/matchmaking.js";
import { deletePhoto, readPhoto, uploadPhoto } from "./actions/photos.js";
import { submitReadinessModule } from "./actions/readiness.js";
import { createReport } from "./actions/reports.js";
import {
  completeOnboarding,
  getSelf,
  loginWithPassword,
  provisionFirebaseUser,
  registerWithPassword,
  updateProfile,
} from "./actions/users.js";
import { actor, bearerFrom, requireAuth, requireOnboarded, requireRole, signSessionToken, verifyBearerToken } from "./auth.js";
import { getDatabase, getDb } from "./db.js";
import { AppError, errorMiddleware, errors, parseInput, route, uuidParam } from "./http.js";
import { pendingMigrations } from "./migrations.js";

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const afterQuerySchema = z.object({ after: z.iso.datetime().optional() });
const photoVariantSchema = z.enum(["full", "blur"]);

export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use("/api", (_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "3mb" }));

  const authed = [requireAuth];
  const member = [requireAuth, requireOnboarded];
  const adminOnly = [requireAuth, requireRole("ADMIN")];

  // ── Health ────────────────────────────────────────────────────────────────
  app.get(
    "/api/health",
    route(async () => {
      const handle = await getDatabase();
      const pending = await pendingMigrations(handle.db);
      return {
        ok: pending.length === 0,
        database: handle.kind,
        pendingMigrations: pending,
        jwtSecretConfigured: (process.env.JWT_SECRET?.length ?? 0) >= 32,
        cronSecretConfigured: Boolean(process.env.CRON_SECRET),
      };
    }),
  );

  // ── Authentication ────────────────────────────────────────────────────────
  app.post(
    "/api/auth/register",
    route(async (req): Promise<AuthResponse> => {
      const db = await getDb();
      const user = await registerWithPassword(db, parseInput(registerSchema, req.body), clientIp(req));
      return { token: await signSessionToken(user.id), user: await getSelf(db, user.id) };
    }),
  );

  app.post(
    "/api/auth/login",
    route(async (req): Promise<AuthResponse> => {
      const db = await getDb();
      const user = await loginWithPassword(db, parseInput(loginSchema, req.body), clientIp(req));
      return { token: await signSessionToken(user.id), user: await getSelf(db, user.id) };
    }),
  );

  /** Exchanges a verified Firebase ID token for an account (creating it on first sign-in). */
  app.post(
    "/api/auth/firebase",
    route(async (req) => {
      const token = bearerFrom(req);
      if (!token) throw errors.unauthorized();
      const verified = await verifyBearerToken(token);
      if (verified.kind !== "firebase") throw errors.badRequest("Expected a Firebase ID token.", "INVALID_TOKEN");
      const db = await getDb();
      const user = await provisionFirebaseUser(db, verified);
      return getSelf(db, user.id);
    }),
  );

  // ── Current user ──────────────────────────────────────────────────────────
  app.get("/api/me", ...authed, route(async (req) => getSelf(await getDb(), actor(req).id)));

  app.post(
    "/api/me/onboarding",
    ...authed,
    route(async (req) => {
      const db = await getDb();
      const user = await completeOnboarding(db, actor(req), parseInput(onboardingSchema, req.body));
      return getSelf(db, user.id);
    }),
  );

  app.patch(
    "/api/me/profile",
    ...member,
    route(async (req) => {
      const db = await getDb();
      const user = await updateProfile(db, actor(req), parseInput(profileUpdateSchema, req.body));
      return getSelf(db, user.id);
    }),
  );

  app.put(
    "/api/me/photo",
    ...member,
    route(async (req) => {
      const db = await getDb();
      await uploadPhoto(db, actor(req), parseInput(photoUploadSchema, req.body));
      return getSelf(db, actor(req).id);
    }),
  );

  app.delete(
    "/api/me/photo",
    ...member,
    route(async (req) => {
      const db = await getDb();
      await deletePhoto(db, actor(req));
      return getSelf(db, actor(req).id);
    }),
  );

  app.get(
    "/api/photos/:userId/:variant",
    ...authed,
    route(async (req: Request, res: Response) => {
      const variant = parseInput(photoVariantSchema, req.params.variant);
      const photo = await readPhoto(await getDb(), actor(req), uuidParam(req.params.userId, "user id"), variant);
      res.setHeader("Content-Type", photo.mimeType);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Content-Disposition", "inline");
      res.send(photo.data);
      return undefined;
    }),
  );

  // ── Readiness Hub ─────────────────────────────────────────────────────────
  app.post(
    "/api/readiness/:moduleId",
    ...member,
    route(async (req) => {
      const { answers } = parseInput(readinessSubmissionSchema, req.body);
      return submitReadinessModule(await getDb(), actor(req), String(req.params.moduleId), answers);
    }),
  );

  // ── Matchmaking ───────────────────────────────────────────────────────────
  app.get("/api/feed", ...member, route(async (req) => getFeed(await getDb(), actor(req))));
  app.get("/api/connections", ...member, route(async (req) => listConnections(await getDb(), actor(req))));

  app.post(
    "/api/connections",
    ...member,
    route(async (req) => {
      const { receiverId } = parseInput(createConnectionSchema, req.body);
      return createConnection(await getDb(), actor(req), receiverId);
    }),
  );

  app.post(
    "/api/connections/:id/decision",
    ...member,
    route(async (req) =>
      decideConnection(await getDb(), actor(req), uuidParam(req.params.id), parseInput(connectionDecisionSchema, req.body)),
    ),
  );

  app.post(
    "/api/connections/:id/withdraw",
    ...member,
    route(async (req) => withdrawConnection(await getDb(), actor(req), uuidParam(req.params.id))),
  );

  app.post(
    "/api/connections/:id/terminate",
    ...member,
    route(async (req) => {
      const { reason } = parseInput(terminateConnectionSchema, req.body ?? {});
      return terminateConnection(await getDb(), actor(req), uuidParam(req.params.id), reason);
    }),
  );

  app.post(
    "/api/connections/:id/photo-consent",
    ...member,
    route(async (req) => {
      const { consent } = parseInput(photoConsentSchema, req.body);
      return setPhotoConsent(await getDb(), actor(req), uuidParam(req.params.id), consent);
    }),
  );

  // ── Chat ──────────────────────────────────────────────────────────────────
  app.get(
    "/api/chats/:id",
    ...member,
    route(async (req) => {
      const { after } = parseInput(afterQuerySchema, req.query);
      return getChat(await getDb(), actor(req), uuidParam(req.params.id), after ? new Date(after) : undefined);
    }),
  );

  app.post(
    "/api/chats/:id/messages",
    ...member,
    route(async (req) => {
      const { text } = parseInput(sendMessageSchema, req.body);
      return sendMessage(await getDb(), actor(req), uuidParam(req.params.id), text);
    }),
  );

  // ── Family links ──────────────────────────────────────────────────────────
  app.get("/api/family", ...member, route(async (req) => getFamilyOverview(await getDb(), actor(req))));

  app.post(
    "/api/family/invites",
    ...member,
    route(async (req) => createInvite(await getDb(), actor(req), parseInput(createInviteSchema, req.body).kind)),
  );

  app.delete(
    "/api/family/invites/:id",
    ...member,
    route(async (req) => revokeInvite(await getDb(), actor(req), uuidParam(req.params.id))),
  );

  app.post(
    "/api/family/redeem",
    ...member,
    route(async (req) => redeemInvite(await getDb(), actor(req), parseInput(redeemInviteSchema, req.body).code)),
  );

  app.delete(
    "/api/family/links/:id",
    ...member,
    route(async (req) => removeLink(await getDb(), actor(req), uuidParam(req.params.id))),
  );

  // ── Reports ───────────────────────────────────────────────────────────────
  app.post(
    "/api/reports",
    ...member,
    route(async (req) => createReport(await getDb(), actor(req), parseInput(reportSchema, req.body))),
  );

  // ── Admin ─────────────────────────────────────────────────────────────────
  app.get("/api/admin/metrics", ...adminOnly, route(async () => admin.getSystemMetrics(await getDb())));
  app.get("/api/admin/moderation", ...adminOnly, route(async () => admin.getModerationQueue(await getDb())));

  app.get(
    "/api/admin/users",
    ...adminOnly,
    route(async (req) => admin.listUsers(await getDb(), parseInput(userDirectoryQuerySchema, req.query))),
  );

  app.get(
    "/api/admin/users/:id",
    ...adminOnly,
    route(async (req) => getUserDetail(await getDb(), uuidParam(req.params.id))),
  );

  app.post(
    "/api/admin/users/:id/status",
    ...adminOnly,
    route(async (req) =>
      admin.setUserAccountStatus(await getDb(), actor(req), uuidParam(req.params.id), parseInput(accountActionSchema, req.body)),
    ),
  );

  app.post(
    "/api/admin/users/:id/role",
    ...adminOnly,
    route(async (req) =>
      admin.assignUserRole(await getDb(), actor(req), uuidParam(req.params.id), parseInput(assignRoleSchema, req.body)),
    ),
  );

  app.delete(
    "/api/admin/users/:id/photo",
    ...adminOnly,
    route(async (req) =>
      admin.removeUserPhoto(
        await getDb(),
        actor(req),
        uuidParam(req.params.id),
        parseInput(removePhotoSchema, req.body).reason,
      ),
    ),
  );

  app.get(
    "/api/admin/connections",
    ...adminOnly,
    route(async (req) => listAllConnections(await getDb(), parseInput(adminConnectionsQuerySchema, req.query))),
  );

  app.get(
    "/api/admin/connections/:id/transcript",
    ...adminOnly,
    route(async (req) => getConversationTranscript(await getDb(), actor(req), uuidParam(req.params.id))),
  );

  app.patch(
    "/api/admin/reports/:id",
    ...adminOnly,
    route(async (req) =>
      admin.updateReport(await getDb(), actor(req), uuidParam(req.params.id), parseInput(reportUpdateSchema, req.body)),
    ),
  );

  app.get(
    "/api/admin/audit-logs",
    ...adminOnly,
    route(async (req) => admin.listAuditLogs(await getDb(), parseInput(auditQuerySchema, req.query))),
  );

  app.post(
    "/api/admin/maintenance/cleanup",
    ...adminOnly,
    route(async () => cleanupStaleConnections(await getDb())),
  );

  // ── Cron (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`) ─────────
  const cron = route(async (req) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new AppError(503, "CRON_NOT_CONFIGURED", "CRON_SECRET is not configured.");
    const provided = bearerFrom(req);
    if (!provided || !secretsMatch(provided, secret)) throw errors.unauthorized("Invalid cron secret.", "INVALID_CRON_SECRET");
    return cleanupStaleConnections(await getDb());
  });
  app.get("/api/cron/cleanup-stale-connections", cron);
  app.post("/api/cron/cleanup-stale-connections", cron);

  app.use("/api", (_req, _res, next) => next(errors.notFound("Endpoint not found.", "ENDPOINT_NOT_FOUND")));
  app.use(errorMiddleware);
  return app;
}

const app = createApp();
export default app;
