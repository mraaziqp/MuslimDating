import { and, eq, or } from "drizzle-orm";
import type { PhotoUploadInput } from "../../src/lib/contracts.js";
import { connections, parentChildLinks, profilePhotos, users, type User } from "../../src/lib/schema.js";
import type { Database } from "../db.js";
import { errors } from "../http.js";
import { photoAccessFor } from "../presenters.js";

const MAX_FULL_BYTES = 1_500_000;
const MAX_BLUR_BYTES = 6_000;

function matchesMagicBytes(buffer: Buffer, mimeType: PhotoUploadInput["mimeType"]): boolean {
  switch (mimeType) {
    case "image/jpeg":
      return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/png":
      return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/webp":
      return (
        buffer.length > 12 &&
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
      );
  }
}

function decodeImage(base64: string, mimeType: PhotoUploadInput["mimeType"], maxBytes: number, label: string): Buffer {
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) throw errors.badRequest(`The ${label} is empty.`, "INVALID_IMAGE");
  if (buffer.length > maxBytes) throw errors.badRequest(`The ${label} is too large.`, "IMAGE_TOO_LARGE");
  if (!matchesMagicBytes(buffer, mimeType)) {
    throw errors.badRequest(`The ${label} is not a valid ${mimeType} file.`, "INVALID_IMAGE");
  }
  return buffer;
}

export async function uploadPhoto(db: Database, user: User, input: PhotoUploadInput): Promise<void> {
  const full = decodeImage(input.fullData, input.mimeType, MAX_FULL_BYTES, "photo");
  const blur = decodeImage(input.blurData, input.mimeType, MAX_BLUR_BYTES, "preview thumbnail");

  const values = {
    userId: user.id,
    mimeType: input.mimeType,
    fullData: full.toString("base64"),
    blurData: blur.toString("base64"),
    updatedAt: new Date(),
  };
  await db
    .insert(profilePhotos)
    .values(values)
    .onConflictDoUpdate({
      target: profilePhotos.userId,
      set: { mimeType: values.mimeType, fullData: values.fullData, blurData: values.blurData, updatedAt: values.updatedAt },
    });
}

export async function deletePhoto(db: Database, user: User): Promise<void> {
  await db.delete(profilePhotos).where(eq(profilePhotos.userId, user.id));
}

export type PhotoVariant = "full" | "blur";

/**
 * Streams a photo only when the access rules allow it. Unauthorised requests
 * receive the same 404 as a missing photo so existence is not revealed.
 */
export async function readPhoto(
  db: Database,
  viewer: User,
  ownerId: string,
  variant: PhotoVariant,
): Promise<{ mimeType: string; data: Buffer }> {
  const notFound = errors.notFound("Photo not available.", "PHOTO_NOT_AVAILABLE");

  const [owner] = await db.select().from(users).where(eq(users.id, ownerId)).limit(1);
  if (!owner) throw notFound;

  const [photo] = await db
    .select({
      mimeType: profilePhotos.mimeType,
      data: variant === "full" ? profilePhotos.fullData : profilePhotos.blurData,
    })
    .from(profilePhotos)
    .where(eq(profilePhotos.userId, ownerId))
    .limit(1);
  if (!photo) throw notFound;

  const [guardianLink] = await db
    .select({ id: parentChildLinks.id })
    .from(parentChildLinks)
    .where(and(eq(parentChildLinks.parentId, viewer.id), eq(parentChildLinks.childId, ownerId)))
    .limit(1);

  const [approved] = await db
    .select({
      senderPhotoConsent: connections.senderPhotoConsent,
      receiverPhotoConsent: connections.receiverPhotoConsent,
    })
    .from(connections)
    .where(
      and(
        eq(connections.status, "APPROVED"),
        or(
          and(eq(connections.senderId, viewer.id), eq(connections.receiverId, ownerId)),
          and(eq(connections.senderId, ownerId), eq(connections.receiverId, viewer.id)),
        ),
      ),
    )
    .limit(1);

  const access = photoAccessFor({
    viewer,
    owner,
    ownerHasPhoto: true,
    viewerIsGuardianOfOwner: guardianLink !== undefined,
    approvedConnection: approved ?? null,
  });

  if (access === "NONE" || (variant === "full" && access !== "FULL")) throw notFound;
  return { mimeType: photo.mimeType, data: Buffer.from(photo.data, "base64") };
}
