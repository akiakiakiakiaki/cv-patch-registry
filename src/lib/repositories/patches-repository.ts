import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { patchTags, patches, synthRevisions, synths, tags } from "@/lib/db/schema";

export type PatchRow = typeof patches.$inferSelect;

export interface PatchListFilter {
  synthSlug?: string;
  tagSlug?: string;
  visibility?: "public";
  ownerId?: string;
}

/** Patch joined with its synth revision and synth, for views and listings. */
export interface PatchWithSynth {
  patch: PatchRow;
  synthSlug: string;
  synthDisplayName: string;
  synthOwnerId: string | null;
  layout: unknown;
  panelSource: string;
  panelBundledSrc: string | null;
  panelAssetId: string | null;
}

const withSynth = (db: Database) =>
  db
    .select({
      patch: patches,
      synthSlug: synths.slug,
      synthDisplayName: synths.displayName,
      synthOwnerId: synths.ownerId,
      layout: synthRevisions.layout,
      panelSource: synthRevisions.panelSource,
      panelBundledSrc: synthRevisions.panelBundledSrc,
      panelAssetId: synthRevisions.panelAssetId,
    })
    .from(patches)
    .innerJoin(synthRevisions, eq(synthRevisions.id, patches.synthRevisionId))
    .innerJoin(synths, eq(synths.id, synthRevisions.synthId));

/** Patches of deleted synths are hidden everywhere, including for their owner. */
export async function findPatchWithSynth(db: Database, patchId: string): Promise<PatchWithSynth | null> {
  const [row] = await withSynth(db).where(and(eq(patches.id, patchId), isNull(synths.deletedAt))).limit(1);
  return row ?? null;
}

export async function listPatchesWithSynth(db: Database, filter: PatchListFilter): Promise<PatchWithSynth[]> {
  const conditions = [isNull(synths.deletedAt)];
  if (filter.ownerId) conditions.push(eq(patches.ownerId, filter.ownerId));
  if (filter.visibility) conditions.push(eq(patches.visibility, filter.visibility));
  if (filter.synthSlug) conditions.push(eq(synths.slug, filter.synthSlug));
  if (filter.tagSlug) {
    const tagged = db
      .select({ patchId: patchTags.patchId })
      .from(patchTags)
      .innerJoin(tags, eq(tags.id, patchTags.tagId))
      .where(eq(tags.slug, filter.tagSlug));
    conditions.push(inArray(patches.id, tagged));
  }
  const query = withSynth(db);
  const filtered = conditions.length > 0 ? query.where(and(...conditions)) : query;
  return filtered.orderBy(desc(patches.updatedAt));
}

export async function tagSlugsFor(db: Database, patchIds: readonly string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (patchIds.length === 0) return map;
  const rows = await db
    .select({ patchId: patchTags.patchId, slug: tags.slug })
    .from(patchTags)
    .innerJoin(tags, eq(tags.id, patchTags.tagId))
    .where(inArray(patchTags.patchId, [...patchIds]));
  for (const row of rows) map.set(row.patchId, [...(map.get(row.patchId) ?? []), row.slug]);
  return map;
}

export async function insertPatch(db: Database, row: typeof patches.$inferInsert): Promise<void> {
  await db.insert(patches).values(row);
}

/**
 * Owner-scoped, revision-checked update. Returns false if the patch is not the owner's
 * or the revision changed meanwhile (both answered as 404 or 409 by the service).
 */
export async function updatePatchIfRevision(
  db: Database,
  input: { patchId: string; ownerId: string; expectedRevision: number; set: Partial<typeof patches.$inferInsert> },
): Promise<boolean> {
  const updated = await db
    .update(patches)
    .set({ ...input.set, revision: input.expectedRevision + 1, updatedAt: new Date() })
    .where(
      and(
        eq(patches.id, input.patchId),
        eq(patches.ownerId, input.ownerId),
        eq(patches.revision, input.expectedRevision),
      ),
    )
    .returning({ id: patches.id });
  return updated.length === 1;
}

export async function deletePatchOwned(db: Database, patchId: string, ownerId: string): Promise<boolean> {
  const deleted = await db
    .delete(patches)
    .where(and(eq(patches.id, patchId), eq(patches.ownerId, ownerId)))
    .returning({ id: patches.id });
  return deleted.length === 1;
}

export async function replacePatchTags(db: Database, patchId: string, tagIds: readonly string[]): Promise<void> {
  await db.delete(patchTags).where(eq(patchTags.patchId, patchId));
  if (tagIds.length > 0) await db.insert(patchTags).values(tagIds.map((tagId) => ({ patchId, tagId })));
}
