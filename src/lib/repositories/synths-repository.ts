import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { synthRevisions, synths } from "@/lib/db/schema";

export type SynthRow = typeof synths.$inferSelect;
export type RevisionRow = typeof synthRevisions.$inferSelect;

/** Any synth with this identifier, deleted or not. Deleted identifiers stay reserved until a cleanup. */
export async function findSynthBySlug(db: Database, slug: string): Promise<SynthRow | null> {
  const [row] = await db.select().from(synths).where(eq(synths.slug, slug)).limit(1);
  return row ?? null;
}

/** A synth that is not deleted. Everything user-facing uses this. */
export async function findActiveSynthBySlug(db: Database, slug: string): Promise<SynthRow | null> {
  const [row] = await db
    .select()
    .from(synths)
    .where(and(eq(synths.slug, slug), isNull(synths.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function listSynthRows(db: Database): Promise<SynthRow[]> {
  return db.select().from(synths).where(isNull(synths.deletedAt)).orderBy(desc(synths.createdAt));
}

export async function findRevision(db: Database, revisionId: string): Promise<RevisionRow | null> {
  const [row] = await db.select().from(synthRevisions).where(eq(synthRevisions.id, revisionId)).limit(1);
  return row ?? null;
}

export async function findLatestRevision(db: Database, synthId: string): Promise<RevisionRow | null> {
  const [row] = await db
    .select()
    .from(synthRevisions)
    .where(eq(synthRevisions.synthId, synthId))
    .orderBy(desc(synthRevisions.number))
    .limit(1);
  return row ?? null;
}

export async function insertSynth(db: Database, row: typeof synths.$inferInsert): Promise<void> {
  await db.insert(synths).values(row);
}

export async function insertRevision(db: Database, row: typeof synthRevisions.$inferInsert): Promise<void> {
  await db.insert(synthRevisions).values(row);
}

/**
 * Moves the synth to a new revision only if it still points at the expected one (optimistic concurrency).
 * Returns false when another save won the race.
 */
export async function advanceSynthRevision(
  db: Database,
  input: { synthId: string; ownerId: string; expectedRevisionId: string | null; nextRevisionId: string },
): Promise<boolean> {
  const updated = await db
    .update(synths)
    .set({ currentRevisionId: input.nextRevisionId, updatedAt: new Date() })
    .where(
      and(
        eq(synths.id, input.synthId),
        eq(synths.ownerId, input.ownerId),
        input.expectedRevisionId === null
          ? isNull(synths.currentRevisionId)
          : eq(synths.currentRevisionId, input.expectedRevisionId),
      ),
    )
    .returning({ id: synths.id });
  return updated.length === 1;
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

