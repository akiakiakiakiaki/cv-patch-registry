import { and, eq } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { assets } from "@/lib/db/schema";

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

