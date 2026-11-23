import { and, count, eq, lt, notExists } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { assets, synthRevisions } from "@/lib/db/schema";

export type AssetRow = typeof assets.$inferSelect;

/** Owner-scoped lookup: another user's asset is indistinguishable from a missing one. */
export async function findActiveOwnedAsset(db: Database, ownerId: string, assetId: string): Promise<AssetRow | null> {
  const [row] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.ownerId, ownerId), eq(assets.status, "active")))
    .limit(1);
  return row ?? null;
}

export async function findAssetById(db: Database, assetId: string): Promise<AssetRow | null> {
  const [row] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  return row ?? null;
}

export async function insertAsset(db: Database, row: typeof assets.$inferInsert): Promise<void> {
  await db.insert(assets).values(row);
}

export async function countAssetsForOwner(db: Database, ownerId: string, kind: string): Promise<number> {
  const [row] = await db.select({ total: count() }).from(assets).where(and(eq(assets.ownerId, ownerId), eq(assets.kind, kind)));
  return Number(row?.total ?? 0);
}

/** The owner's panels that no synth revision references and that were uploaded before `before`. */
export async function findUnusedPanels(db: Database, ownerId: string, before: Date): Promise<AssetRow[]> {
  return db
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.ownerId, ownerId),
        eq(assets.kind, "panel"),
        lt(assets.createdAt, before),
        notExists(db.select({ id: synthRevisions.id }).from(synthRevisions).where(eq(synthRevisions.panelAssetId, assets.id))),
      ),
    );
}

/** Deletes the row; fails (foreign key) if a synth revision started using the asset meanwhile. */
export async function deleteAsset(db: Database, assetId: string): Promise<void> {
  await db.delete(assets).where(eq(assets.id, assetId));
}
