export const CURATED_TAGS = [
  { slug: "bass", label: "Bass" },
  { slug: "lead", label: "Lead" },
  { slug: "pad", label: "Pad" },
  { slug: "drone", label: "Drone" },
  { slug: "fx", label: "FX" },
  { slug: "percussion", label: "Percussion" },
  { slug: "sequence", label: "Sequence" },
] as const;

export const MAX_TAGS_PER_PATCH = 10;
const MAX_TAG_LENGTH = 32;
const TAG_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} -]*$/u;

/** Lowercase, single spaces, no leading or trailing whitespace. Returns null for unusable input. */
export function normalizeTag(raw: string): string | null {
  const slug = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (slug.length === 0 || slug.length > MAX_TAG_LENGTH || !TAG_PATTERN.test(slug)) return null;
  return slug;
}

/**
 * How a tag is shown: single spaces and an uppercase first letter, the rest as typed ("acid house" → "Acid house",
 * "TB-303" stays). The slug (see normalizeTag) stays the tag's identity, so case never creates a second tag.
 */
export function formatTagLabel(raw: string): string | null {
  if (!normalizeTag(raw)) return null;
  const label = raw.trim().replace(/\s+/g, " ");
  const [first = "", ...rest] = Array.from(label);
  return first.toLocaleUpperCase() + rest.join("");
}

export interface TagEntry {
  slug: string;
  label: string;
}

export type TagNormalization =
  | { ok: true; tags: string[]; entries: TagEntry[] }
  | { ok: false; reason: "invalid" | "too-many" };

/** Validates typed tags; duplicates by slug are dropped, the first spelling wins. */
export function normalizeTags(raw: readonly string[]): TagNormalization {
  const entries: TagEntry[] = [];
  for (const entry of raw) {
    const slug = normalizeTag(entry);
    const label = formatTagLabel(entry);
    if (!slug || !label) return { ok: false, reason: "invalid" };
    if (!entries.some((existing) => existing.slug === slug)) entries.push({ slug, label });
  }
  if (entries.length > MAX_TAGS_PER_PATCH) return { ok: false, reason: "too-many" };
  return { ok: true, tags: entries.map((entry) => entry.slug), entries };
}
