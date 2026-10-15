import { describe, expect, it } from "vitest";
import { CURATED_TAGS, MAX_TAGS_PER_PATCH, normalizeTag, normalizeTags } from "@/lib/domain/tags";

describe("tag normalization", () => {
  it("lowercases, trims and collapses whitespace", () => {
    expect(normalizeTag("  Sound   Design ")).toBe("sound design");
  });

  it("rejects empty, too long or unusual tags", () => {
    expect(normalizeTag("   ")).toBeNull();
    expect(normalizeTag("a".repeat(33))).toBeNull();
    expect(normalizeTag("<script>")).toBeNull();
  });

  it("removes duplicates after normalization", () => {
    expect(normalizeTags(["Bass", " bass ", "FX"])).toEqual({ ok: true, tags: ["bass", "fx"] });
  });

  it("allows up to ten tags per patch", () => {
    const ten = Array.from({ length: MAX_TAGS_PER_PATCH }, (_, index) => `tag ${index}`);
    expect(normalizeTags(ten)).toMatchObject({ ok: true });
    expect(normalizeTags([...ten, "one more"])).toEqual({ ok: false, reason: "too-many" });
  });

  it("ships the curated categories", () => {
    expect(CURATED_TAGS.map((tag) => tag.slug)).toEqual(["bass", "lead", "pad", "drone", "fx", "percussion", "sequence"]);
  });
});
