import { describe, expect, it } from "vitest";
import { CURATED_TAGS, MAX_TAGS_PER_PATCH, formatTagLabel, normalizeTag, normalizeTags } from "@/lib/domain/tags";

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
    expect(normalizeTags(["Bass", " bass ", "FX"])).toEqual({
      ok: true,
      tags: ["bass", "fx"],
      entries: [
        { slug: "bass", label: "Bass" },
        { slug: "fx", label: "FX" },
      ],
    });
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

describe("formatTagLabel", () => {
  it("starts with an uppercase letter and keeps the rest as typed", () => {
    expect(formatTagLabel("acid house")).toBe("Acid house");
    expect(formatTagLabel("TB-303")).toBe("TB-303");
    expect(formatTagLabel("  über   weich ")).toBe("Über weich");
    expect(formatTagLabel("303")).toBe("303");
  });

  it("rejects what normalizeTag rejects", () => {
    expect(formatTagLabel("")).toBeNull();
    expect(formatTagLabel("bad!")).toBeNull();
    expect(formatTagLabel("x".repeat(33))).toBeNull();
  });
});

describe("normalizeTags entries", () => {
  it("keeps the first spelling of a tag and its label with an uppercase start", () => {
    expect(normalizeTags(["acid", "ACID", "tb-303"])).toEqual({
      ok: true,
      tags: ["acid", "tb-303"],
      entries: [
        { slug: "acid", label: "Acid" },
        { slug: "tb-303", label: "Tb-303" },
      ],
    });
  });
});

