import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import { hiddenSynthSlugs } from "@/lib/synths/legacy-visibility";
import type { Database } from "@/lib/db/client";
import { assets, patchSamples, patches, synthRevisions, synths, user } from "@/lib/db/schema";

export type SampleRow = typeof patchSamples.$inferSelect;

export async function findSampleByPatch(db: Database, patchId: string): Promise<SampleRow | null> {
  const [row] = await db.select().from(patchSamples).where(eq(patchSamples.patchId, patchId)).limit(1);
  return row ?? null;
}

export async function insertSample(db: Database, row: typeof patchSamples.$inferInsert): Promise<void> {
  await db.insert(patchSamples).values(row);
}

/** Points the patch's sample at another asset; the previous asset is left for the caller to remove. */
export async function replaceSample(db: Database, row: typeof patchSamples.$inferInsert): Promise<void> {
  const { patchId, ...set } = row;
  await db.update(patchSamples).set(set).where(eq(patchSamples.patchId, patchId));
}

/** Bytes the owner has stored across all active assets (panels and samples). */
export async function storedBytesForOwner(db: Database, ownerId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${assets.byteSize}), 0)` })
    .from(assets)
    .where(eq(assets.ownerId, ownerId));
  return Number(row?.total ?? 0);
}

/** One uploaded sample file with what uses it: a patch (with its synth), or nothing. */
export interface SampleAdminRow {
  assetId: string;
  storageKey: string;
  byteSize: number;
  createdAt: Date;
  uploader: { name: string; email: string };
  /** Title and license, from the patch it belongs to; null for a file no patch uses. */
  sample: { title: string; license: string } | null;
  patch: { id: string; name: string; visibility: string; ownerName: string } | null;
  synth: { slug: string; displayName: string; deleted: boolean } | null;
}

/**
 * Every sample file, newest first, for the admin's sample overview. Files on patches of hidden synths (see
 * legacy-visibility) are left out, like everywhere else; files no patch uses are always listed.
 */
export async function listSamplesForAdmin(db: Database): Promise<SampleAdminRow[]> {
  const uploader = alias(user, "uploader");
  const patchOwner = alias(user, "patch_owner");
  const rows = await db
    .select({
      asset: assets,
      uploaderName: uploader.name,
      uploaderEmail: uploader.email,
      link: patchSamples,
      patch: patches,
      patchOwnerName: patchOwner.name,
      synth: synths,
    })
    .from(assets)
    .innerJoin(uploader, eq(uploader.id, assets.ownerId))
    .leftJoin(patchSamples, eq(patchSamples.assetId, assets.id))
    .leftJoin(patches, eq(patches.id, patchSamples.patchId))
    .leftJoin(patchOwner, eq(patchOwner.id, patches.ownerId))
    .leftJoin(synthRevisions, eq(synthRevisions.id, patches.synthRevisionId))
    .leftJoin(synths, eq(synths.id, synthRevisions.synthId))
    .where(and(eq(assets.kind, "sample"), notHiddenSynth()))
    .orderBy(desc(assets.createdAt));
  return rows.map((row) => ({
    assetId: row.asset.id,
    storageKey: row.asset.storageKey,
    byteSize: row.asset.byteSize,
    createdAt: row.asset.createdAt,
    uploader: { name: row.uploaderName, email: row.uploaderEmail },
    sample: row.link ? { title: row.link.title, license: row.link.license } : null,
    patch: row.patch ? { id: row.patch.id, name: row.patch.name, visibility: row.patch.visibility, ownerName: row.patchOwnerName ?? "" } : null,
    synth: row.synth ? { slug: row.synth.slug, displayName: row.synth.displayName, deleted: row.synth.deletedAt !== null } : null,
  }));
}

/** No synth (a file no patch uses) or a synth that is not hidden. */
function notHiddenSynth(): SQL | undefined {
  const hidden = hiddenSynthSlugs();
  return hidden.length > 0 ? or(isNull(synths.slug), notInArray(synths.slug, [...hidden])) : undefined;
}

