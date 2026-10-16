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

