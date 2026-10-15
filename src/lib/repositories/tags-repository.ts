import { eq, inArray } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { tags } from "@/lib/db/schema";
import { CURATED_TAGS } from "@/lib/domain/tags";

/** Returns the tag IDs for the given slugs, creating missing free tags on the fly. */
export async function ensureTagIds(db: Database, slugs: readonly string[]): Promise<string[]> {
  if (slugs.length === 0) return [];
  await db
    .insert(tags)
    .values(slugs.map((slug) => ({ id: slug, slug, label: slug, kind: "free" })))
    .onConflictDoNothing({ target: tags.slug });
  const rows = await db.select({ id: tags.id }).from(tags).where(inArray(tags.slug, [...slugs]));
  return rows.map((row) => row.id);
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
