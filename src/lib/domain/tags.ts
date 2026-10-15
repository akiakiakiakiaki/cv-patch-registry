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

export type TagNormalization = { ok: true; tags: string[] } | { ok: false; reason: "invalid" | "too-many" };

export function normalizeTags(raw: readonly string[]): TagNormalization {
  const normalized: string[] = [];
  for (const entry of raw) {
    const tag = normalizeTag(entry);
    if (!tag) return { ok: false, reason: "invalid" };
    if (!normalized.includes(tag)) normalized.push(tag);
  }
  if (normalized.length > MAX_TAGS_PER_PATCH) return { ok: false, reason: "too-many" };
  return { ok: true, tags: normalized };
}
