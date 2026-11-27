import { and, eq, inArray, isNotNull, ne, notInArray, or, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { account, assets, patchSamples, patchTags, patches, session, synthRevisions, synths, tags, user, verification } from "@/lib/db/schema";

/**
 * Everything stored about one account, for the copy it gets before it is deleted. Whole rows wherever they hold
 * nothing secret, so columns added later are part of it without touching this. Left out: password hashes, OAuth
 * tokens and session tokens.
 */
export interface UserDataExport {
  user: typeof user.$inferSelect;
  /** How the account signs in (e.g. "credential" for email and password), without secrets. */
  signInMethods: Array<{ providerId: string; createdAt: Date; updatedAt: Date }>;
  sessions: Array<{ createdAt: Date; expiresAt: Date; ipAddress: string | null; userAgent: string | null }>;
  patches: Array<
    typeof patches.$inferSelect & {
      tags: string[];
      sample: { title: string; license: string; rightsConfirmedAt: Date; file: string; mime: string; byteSize: number } | null;
    }
  >;
  synths: Array<typeof synths.$inferSelect & { revisions: Array<typeof synthRevisions.$inferSelect> }>;
  /** Uploaded files (panels, samples) as stored, without the files themselves. */
  uploads: Array<typeof assets.$inferSelect>;
}

/** Null when the account does not exist. */
export async function collectUserData(db: Database, userId: string): Promise<UserDataExport | null> {
  const [row] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!row) return null;
  const [signInMethods, sessions, patchRows, synthRows, uploads] = await Promise.all([
    db.select({ providerId: account.providerId, createdAt: account.createdAt, updatedAt: account.updatedAt }).from(account).where(eq(account.userId, userId)),
    db
      .select({ createdAt: session.createdAt, expiresAt: session.expiresAt, ipAddress: session.ipAddress, userAgent: session.userAgent })
      .from(session)
      .where(eq(session.userId, userId)),
    db.select().from(patches).where(eq(patches.ownerId, userId)).orderBy(patches.createdAt),
    db.select().from(synths).where(eq(synths.ownerId, userId)).orderBy(synths.createdAt),
    db.select().from(assets).where(eq(assets.ownerId, userId)).orderBy(assets.createdAt),
  ]);
  const patchIds = patchRows.map((patch) => patch.id);
  const synthIds = synthRows.map((synth) => synth.id);
  const [tagRows, sampleRows, revisionRows] = await Promise.all([
    patchIds.length
      ? db.select({ patchId: patchTags.patchId, slug: tags.slug }).from(patchTags).innerJoin(tags, eq(tags.id, patchTags.tagId)).where(inArray(patchTags.patchId, patchIds))
      : [],
    patchIds.length
      ? db
          .select({
            patchId: patchSamples.patchId,
            title: patchSamples.title,
            license: patchSamples.license,
            rightsConfirmedAt: patchSamples.rightsConfirmedAt,
            file: assets.storageKey,
            mime: assets.mime,
            byteSize: assets.byteSize,
          })
          .from(patchSamples)
          .innerJoin(assets, eq(assets.id, patchSamples.assetId))
          .where(inArray(patchSamples.patchId, patchIds))
      : [],
    synthIds.length ? db.select().from(synthRevisions).where(inArray(synthRevisions.synthId, synthIds)).orderBy(synthRevisions.number) : [],
  ]);
  return {
    user: row,
    signInMethods,
    sessions,
    patches: patchRows.map((patch) => {
      const sample = sampleRows.find((entry) => entry.patchId === patch.id);
      return {
        ...patch,
        tags: tagRows.filter((tag) => tag.patchId === patch.id).map((tag) => tag.slug),
        sample: sample
          ? { title: sample.title, license: sample.license, rightsConfirmedAt: sample.rightsConfirmedAt, file: sample.file, mime: sample.mime, byteSize: sample.byteSize }
          : null,
      };
    }),
    synths: synthRows.map((synth) => ({ ...synth, revisions: revisionRows.filter((revision) => revision.synthId === synth.id) })),
    uploads,
  };
}

/** The address a deleted account keeps: unique like every address, reserved (.invalid), and free for a new sign-up. */
export function deletedUserEmail(userId: string): string {
  return `deleted-${userId}@deleted.invalid`;
}

/**
 * Deletes an account for good, in one transaction: its private patches (with their samples), its sign-in data,
 * sessions and pending links, and uploads nothing uses anymore. Public patches and synths stay for others; while
 * they exist the account row stays as well, with everything personal cleared and `deletedAt` set, because they
 * point at it. Without them the row goes too. Returns the storage keys of files to remove after the commit, or null
 * when there is no such account (or it was deleted already).
 */
export async function deleteUserData(db: Database, userId: string): Promise<{ storageKeys: string[]; keptRow: boolean } | null> {
  return db.transaction(async (tx) => {
    const [target] = await tx.select({ email: user.email, deletedAt: user.deletedAt }).from(user).where(eq(user.id, userId)).for("update");
    if (!target || target.deletedAt) return null;

    const privatePatchIds = (
      await tx.select({ id: patches.id }).from(patches).where(and(eq(patches.ownerId, userId), ne(patches.visibility, "public")))
    ).map((patch) => patch.id);
    const privateSampleIds = privatePatchIds.length
      ? (await tx.select({ assetId: patchSamples.assetId }).from(patchSamples).where(inArray(patchSamples.patchId, privatePatchIds))).map((row) => row.assetId)
      : [];
    if (privatePatchIds.length) await tx.delete(patches).where(inArray(patches.id, privatePatchIds));
    const sampleKeys = privateSampleIds.length
      ? (await tx.delete(assets).where(inArray(assets.id, privateSampleIds)).returning({ storageKey: assets.storageKey })).map((row) => row.storageKey)
      : [];

    // Uploads no synth revision shows and no remaining sample uses, e.g. a panel uploaded for a synth never saved.
    const usedPanels = tx.select({ id: synthRevisions.panelAssetId }).from(synthRevisions).where(isNotNull(synthRevisions.panelAssetId));
    const usedSamples = tx.select({ id: patchSamples.assetId }).from(patchSamples);
    const unusedKeys = (
      await tx
        .delete(assets)
        .where(and(eq(assets.ownerId, userId), notInArray(assets.id, sql`(${usedPanels})`), notInArray(assets.id, sql`(${usedSamples})`)))
        .returning({ storageKey: assets.storageKey })
    ).map((row) => row.storageKey);

    await tx.delete(session).where(eq(session.userId, userId));
    await tx.delete(account).where(eq(account.userId, userId));
    // Pending links: email changes are keyed by address, password resets carry the user id as value.
    await tx.delete(verification).where(or(eq(verification.identifier, target.email), eq(verification.value, userId)));

    const stillUsed = await Promise.all([
      tx.$count(patches, eq(patches.ownerId, userId)),
      tx.$count(synths, eq(synths.ownerId, userId)),
      tx.$count(assets, eq(assets.ownerId, userId)),
    ]);
    const keptRow = stillUsed.some((count) => count > 0);
    if (keptRow) {
      const now = new Date();
      // Every personal column cleared; a column added to the user table later must be cleared here too.
      await tx
        .update(user)
        .set({ name: "", email: deletedUserEmail(userId), emailVerified: false, image: null, role: "user", disabledAt: now, deletedAt: now, updatedAt: now })
        .where(eq(user.id, userId));
    } else {
      await tx.delete(user).where(eq(user.id, userId));
    }
    return { storageKeys: [...sampleKeys, ...unusedKeys], keptRow };
  });
}
