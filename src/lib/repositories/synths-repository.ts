import { and, desc, eq, inArray, isNotNull, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import { isAdmin, type Actor } from "@/lib/domain/policy";
import { KEPT_RECENT_REVISIONS } from "@/lib/domain/synth-revisions";
import type { Database } from "@/lib/db/client";
import { assets, patchSamples, patches, synthRevisions, synths, user } from "@/lib/db/schema";
import { hiddenSynthSlugs } from "@/lib/synths/legacy-visibility";

export type SynthRow = typeof synths.$inferSelect;
export type RevisionRow = typeof synthRevisions.$inferSelect;

/** Any synth with this identifier, deleted or not. Deleted identifiers stay reserved until a cleanup. */
export async function findSynthBySlug(db: Database, slug: string): Promise<SynthRow | null> {
  const [row] = await db.select().from(synths).where(eq(synths.slug, slug)).limit(1);
  return row ?? null;
}

/**
 * Synths `viewer` may see: not deleted, not hidden (see legacy-visibility), and approved unless the viewer
 * owns the synth or is an admin (see canSeeSynth). Shared by every synth and patch query, so an unapproved
 * synth and its patches stay out of lists, views and links for everyone else. `null` is a visitor.
 */
export function visibleSynthCondition(viewer: Actor | null): SQL {
  if (isAdmin(viewer)) return existingSynthCondition();
  const approval = viewer ? or(isNotNull(synths.approvedAt), eq(synths.ownerId, viewer.id))! : isNotNull(synths.approvedAt);
  return and(existingSynthCondition(), approval)!;
}

/** Not deleted and not hidden (see legacy-visibility), regardless of approval. */
function existingSynthCondition(): SQL {
  const hidden = hiddenSynthSlugs();
  return hidden.length > 0 ? and(isNull(synths.deletedAt), notInArray(synths.slug, [...hidden]))! : isNull(synths.deletedAt);
}

/** A synth `viewer` may see (see visibleSynthCondition). Everything user-facing uses this. */
export async function findActiveSynthBySlug(db: Database, slug: string, viewer: Actor | null): Promise<SynthRow | null> {
  const [row] = await db
    .select()
    .from(synths)
    .where(and(eq(synths.slug, slug), visibleSynthCondition(viewer)))
    .limit(1);
  return row ?? null;
}

export async function listSynthRows(db: Database, viewer: Actor | null): Promise<SynthRow[]> {
  return db.select().from(synths).where(visibleSynthCondition(viewer)).orderBy(desc(synths.createdAt));
}

/** A synth row for the admin's management list: with its owner and how many patches (of how many users) use it. */
export type SynthAdminRow = SynthRow & {
  ownerName: string | null;
  ownerEmail: string | null;
  ownerDeleted: boolean;
  patchCount: number;
  patchOwnerCount: number;
  /** Revisions stored for the synth (numbers keep their gaps after "reduce revisions"). */
  storedRevisions: number;
};

/** Every synth that is not hidden, deleted ones included, for the admin's management list. Newest first. */
export async function listSynthsForAdmin(db: Database): Promise<SynthAdminRow[]> {
  const hidden = hiddenSynthSlugs();
  const usage = db
    .select({
      synthId: synthRevisions.synthId,
      patchCount: sql<number>`count(${patches.id})::int`.as("patch_count"),
      patchOwnerCount: sql<number>`count(distinct ${patches.ownerId})::int`.as("patch_owner_count"),
    })
    .from(patches)
    .innerJoin(synthRevisions, eq(synthRevisions.id, patches.synthRevisionId))
    .groupBy(synthRevisions.synthId)
    .as("usage");
  const stored = db
    .select({ synthId: synthRevisions.synthId, count: sql<number>`count(*)::int`.as("stored_count") })
    .from(synthRevisions)
    .groupBy(synthRevisions.synthId)
    .as("stored");
  const rows = await db
    .select({
      synth: synths,
      ownerName: user.name,
      ownerEmail: user.email,
      ownerDeletedAt: user.deletedAt,
      patchCount: usage.patchCount,
      patchOwnerCount: usage.patchOwnerCount,
      storedRevisions: stored.count,
    })
    .from(synths)
    .leftJoin(user, eq(user.id, synths.ownerId))
    .leftJoin(usage, eq(usage.synthId, synths.id))
    .leftJoin(stored, eq(stored.synthId, synths.id))
    .where(hidden.length > 0 ? notInArray(synths.slug, [...hidden]) : undefined)
    .orderBy(desc(synths.createdAt));
  return rows.map((row) => ({
    ...row.synth,
    ownerName: row.ownerName,
    ownerEmail: row.ownerEmail,
    ownerDeleted: row.ownerDeletedAt !== null,
    patchCount: row.patchCount ?? 0,
    patchOwnerCount: row.patchOwnerCount ?? 0,
    storedRevisions: row.storedRevisions ?? 0,
  }));
}

/**
 * Approves a synth (now) or takes the approval back, also while it is deleted, so it can be restored unapproved.
 * False when the synth does not exist.
 */
export async function setSynthApproval(db: Database, synthId: string, approved: boolean): Promise<boolean> {
  const updated = await db
    .update(synths)
    .set({ approvedAt: approved ? new Date() : null })
    .where(eq(synths.id, synthId))
    .returning({ id: synths.id });
  return updated.length === 1;
}

/** Restores a soft-deleted synth (any owner). False when the synth does not exist or is not deleted. */
export async function restoreSynth(db: Database, synthId: string): Promise<boolean> {
  const updated = await db
    .update(synths)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(synths.id, synthId), isNotNull(synths.deletedAt)))
    .returning({ id: synths.id });
  return updated.length === 1;
}

/**
 * Removes a soft-deleted synth for good, in one transaction: every patch on any of its revisions (with tags and
 * sample links), the synth with all revisions, and the panel and sample assets nothing else uses anymore.
 * Returns the storage keys of the removed assets, so the caller can delete the files; null when the synth
 * does not exist or is not deleted.
 */
export async function purgeDeletedSynth(db: Database, synthId: string): Promise<{ storageKeys: string[] } | null> {
  return db.transaction(async (tx) => {
    const [synth] = await tx
      .select({ id: synths.id })
      .from(synths)
      .where(and(eq(synths.id, synthId), isNotNull(synths.deletedAt)))
      .for("update");
    if (!synth) return null;
    const revisions = await tx.select({ id: synthRevisions.id, panelAssetId: synthRevisions.panelAssetId }).from(synthRevisions).where(eq(synthRevisions.synthId, synthId));
    const revisionIds = revisions.map((revision) => revision.id);
    const synthPatches = revisionIds.length
      ? await tx.select({ id: patches.id }).from(patches).where(inArray(patches.synthRevisionId, revisionIds))
      : [];
    const patchIds = synthPatches.map((patch) => patch.id);
    const sampleAssetIds = patchIds.length
      ? (await tx.select({ assetId: patchSamples.assetId }).from(patchSamples).where(inArray(patchSamples.patchId, patchIds))).map((row) => row.assetId)
      : [];

    if (patchIds.length) await tx.delete(patches).where(inArray(patches.id, patchIds));
    await tx.delete(synths).where(eq(synths.id, synthId));

    const sampleKeys = sampleAssetIds.length
      ? (await tx.delete(assets).where(inArray(assets.id, sampleAssetIds)).returning({ storageKey: assets.storageKey })).map((row) => row.storageKey)
      : [];
    // Panels another synth's revision still shows stay.
    return { storageKeys: [...sampleKeys, ...(await removeUnusedPanels(tx, revisions.map((revision) => revision.panelAssetId)))] };
  });
}

type Executor = Pick<Database, "select" | "selectDistinct">;

/**
 * Revisions of a synth that can go: not among the newest KEPT_RECENT_REVISIONS, not the current one, and not used
 * by any patch (patches keep the revision they were saved with). The one rule for counting and for removing.
 */
async function removableRevisions(db: Executor, synthId: string): Promise<Array<{ id: string; panelAssetId: string | null }>> {
  const [synth] = await db.select({ currentRevisionId: synths.currentRevisionId }).from(synths).where(eq(synths.id, synthId)).limit(1);
  if (!synth) return [];
  const revisions = await db
    .select({ id: synthRevisions.id, panelAssetId: synthRevisions.panelAssetId })
    .from(synthRevisions)
    .where(eq(synthRevisions.synthId, synthId))
    .orderBy(desc(synthRevisions.number));
  if (revisions.length <= KEPT_RECENT_REVISIONS) return [];
  const used = new Set(
    (
      await db
        .selectDistinct({ id: patches.synthRevisionId })
        .from(patches)
        .where(inArray(patches.synthRevisionId, revisions.map((revision) => revision.id)))
    ).map((row) => row.id),
  );
  return revisions.slice(KEPT_RECENT_REVISIONS).filter((revision) => revision.id !== synth.currentRevisionId && !used.has(revision.id));
}

/** Number of revisions "reduce revisions" would remove (see removableRevisions). */
export async function countRemovableRevisions(db: Database, synthId: string): Promise<number> {
  return (await removableRevisions(db, synthId)).length;
}

/**
 * Removes the revisions nothing needs anymore (see removableRevisions) and the panel images only they used.
 * Returns how many revisions were removed and the storage keys of the removed panels, so the caller can delete
 * the files.
 */
export async function removeUnusedRevisions(db: Database, synthId: string): Promise<{ removed: number; storageKeys: string[] }> {
  return db.transaction(async (tx) => {
    // Locks the synth, so a revision saved meanwhile cannot become current between counting and removing.
    await tx.select({ id: synths.id }).from(synths).where(eq(synths.id, synthId)).for("update");
    const removable = await removableRevisions(tx, synthId);
    if (!removable.length) return { removed: 0, storageKeys: [] };
    await tx.delete(synthRevisions).where(inArray(synthRevisions.id, removable.map((revision) => revision.id)));
    return { removed: removable.length, storageKeys: await removeUnusedPanels(tx, removable.map((revision) => revision.panelAssetId)) };
  });
}

/** Deletes those of the given panel assets that no revision shows anymore; returns their storage keys. */
async function removeUnusedPanels(tx: Pick<Database, "select" | "delete">, panelAssetIds: ReadonlyArray<string | null>): Promise<string[]> {
  const candidates = [...new Set(panelAssetIds.filter((id): id is string => id !== null))];
  if (!candidates.length) return [];
  const stillUsed = new Set(
    (await tx.select({ id: synthRevisions.panelAssetId }).from(synthRevisions).where(inArray(synthRevisions.panelAssetId, candidates))).map((row) => row.id),
  );
  const unused = candidates.filter((id) => !stillUsed.has(id));
  if (!unused.length) return [];
  return (await tx.delete(assets).where(inArray(assets.id, unused)).returning({ storageKey: assets.storageKey })).map((row) => row.storageKey);
}

export async function findRevision(db: Database, revisionId: string): Promise<RevisionRow | null> {
  const [row] = await db.select().from(synthRevisions).where(eq(synthRevisions.id, revisionId)).limit(1);
  return row ?? null;
}

/** Creates the synth and its initial revision together; a duplicate slug returns false. */
export async function createSynthWithInitialRevision(
  db: Database,
  input: {
    synth: Omit<typeof synths.$inferInsert, "currentRevisionId">;
    revision: typeof synthRevisions.$inferInsert;
  },
): Promise<boolean> {
  if (input.revision.synthId !== input.synth.id) {
    throw new Error("Initial synth revision must belong to its synth");
  }
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(synths)
      .values({ ...input.synth, currentRevisionId: input.revision.id })
      .onConflictDoNothing({ target: synths.slug })
      .returning({ id: synths.id });
    if (!inserted) return false;
    await tx.insert(synthRevisions).values(input.revision);
    return true;
  });
}

/**
 * Advances the current revision only if it still matches the editor's base revision. The pointer,
 * synth metadata and immutable revision row commit or roll back as one transaction.
 */
export async function appendSynthRevision(
  db: Database,
  input: {
    synthId: string;
    ownerId: string;
    expectedRevisionId: string;
    synth: Pick<typeof synths.$inferInsert, "displayName" | "manufacturer">;
    revision: typeof synthRevisions.$inferInsert;
  },
): Promise<boolean> {
  if (input.revision.synthId !== input.synthId) {
    throw new Error("Synth revision must belong to the synth being updated");
  }
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(synths)
      .set({
        ...input.synth,
        currentRevisionId: input.revision.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(synths.id, input.synthId),
          eq(synths.ownerId, input.ownerId),
          eq(synths.currentRevisionId, input.expectedRevisionId),
          isNull(synths.deletedAt),
        ),
      )
      .returning({ id: synths.id });
    if (updated.length !== 1) return false;
    await tx.insert(synthRevisions).values(input.revision);
    return true;
  });
}

/** Owner-scoped soft delete. Revisions, panels and patches stay in place for the later cleanup. */
export async function markSynthDeleted(db: Database, synthId: string, ownerId: string): Promise<boolean> {
  const updated = await db
    .update(synths)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(synths.id, synthId), eq(synths.ownerId, ownerId), isNull(synths.deletedAt)))
    .returning({ id: synths.id });
  return updated.length === 1;
}

