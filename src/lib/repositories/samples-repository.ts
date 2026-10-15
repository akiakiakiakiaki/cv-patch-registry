import { eq, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { assets, patchSamples } from "@/lib/db/schema";

export type SampleRow = typeof patchSamples.$inferSelect;

export async function findSampleByPatch(db: Database, patchId: string): Promise<SampleRow | null> {
  const [row] = await db.select().from(patchSamples).where(eq(patchSamples.patchId, patchId)).limit(1);
  return row ?? null;
}

export async function insertSample(db: Database, row: typeof patchSamples.$inferInsert): Promise<void> {
  await db.insert(patchSamples).values(row);
}

/** Bytes the owner has stored across all active assets (panels and samples). */
export async function storedBytesForOwner(db: Database, ownerId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${assets.byteSize}), 0)` })
    .from(assets)
    .where(eq(assets.ownerId, ownerId));
  return Number(row?.total ?? 0);
}
