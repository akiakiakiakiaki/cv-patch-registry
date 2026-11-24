import { and, eq, exists, ilike, inArray, or, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { patchTags, patches, tags } from "@/lib/db/schema";
import { CURATED_TAGS, formatTagLabel, type TagEntry } from "@/lib/domain/tags";

/**
 * Returns the tag IDs for the given tags, creating missing free tags on the fly with their label.
 * Existing tags keep their label: the first spelling wins ("FX" stays "FX" when someone types "fx").
 */
export async function ensureTagIds(db: Database, entries: readonly TagEntry[]): Promise<string[]> {
  if (entries.length === 0) return [];
  await db
    .insert(tags)
    .values(entries.map((entry) => ({ id: entry.slug, slug: entry.slug, label: entry.label, kind: "free" })))
    .onConflictDoNothing({ target: tags.slug });
  const rows = await db.select({ id: tags.id }).from(tags).where(inArray(tags.slug, entries.map((entry) => entry.slug)));
  return rows.map((row) => row.id);
}

/**
 * Existing tags to suggest while typing: curated tags, tags of public patches and the viewer's own tags,
 * never tags only used on other people's private patches. Prefix matches come first, then the most used.
 */
export async function suggestTags(
  db: Database,
  options: { query: string; ownerId: string | null; limit: number },
): Promise<TagEntry[]> {
  const usedOn = (condition: ReturnType<typeof eq>) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(patchTags)
        .innerJoin(patches, eq(patches.id, patchTags.patchId))
        .where(and(eq(patchTags.tagId, tags.id), condition)),
    );
  const visible = or(
    eq(tags.kind, "curated"),
    usedOn(eq(patches.visibility, "public")),
    ...(options.ownerId ? [usedOn(eq(patches.ownerId, options.ownerId))] : []),
  );
  const query = options.query.trim().toLowerCase().replace(/[\\%_]/g, (char) => `\\${char}`);
  const usage = sql<number>`(select count(*) from ${patchTags} where ${patchTags.tagId} = ${tags.id})`;
  const prefix = sql<number>`case when ${tags.slug} like ${`${query}%`} then 0 else 1 end`;
  return db
    .select({ slug: tags.slug, label: tags.label })
    .from(tags)
    .where(query ? and(visible, ilike(tags.slug, `%${query}%`)) : visible)
    .orderBy(prefix, sql`${usage} desc`, tags.label)
    .limit(options.limit);
}

export async function seedCuratedTags(db: Database): Promise<void> {
  await db
    .insert(tags)
    .values(CURATED_TAGS.map((tag) => ({ id: tag.slug, slug: tag.slug, label: tag.label, kind: "curated" })))
    .onConflictDoNothing({ target: tags.slug });
}

export async function findTagBySlug(db: Database, slug: string): Promise<{ id: string } | null> {
  const [row] = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, slug)).limit(1);
  return row ?? null;
}

/**
 * Brings free tags created before labels had an uppercase start in line ("acid" → "Acid").
 * Without `apply` it only reports the changes. Curated tags keep their labels.
 */
export async function capitalizeTagLabels(db: Database, apply: boolean): Promise<Array<{ slug: string; from: string; to: string }>> {
  const rows = await db.select({ id: tags.id, slug: tags.slug, label: tags.label }).from(tags).where(eq(tags.kind, "free"));
  const changes = rows.flatMap((row) => {
    const to = formatTagLabel(row.label);
    return to && to !== row.label ? [{ id: row.id, slug: row.slug, from: row.label, to }] : [];
  });
  if (apply) {
    for (const change of changes) await db.update(tags).set({ label: change.to }).where(eq(tags.id, change.id));
  }
  return changes.map(({ slug, from, to }) => ({ slug, from, to }));
}

