import { describe, expect, it } from "vitest";
import { rescaleCategory } from "@/components/synth-editor/category-draft";
import { draftToLayout, parseSynthDraft, parseSynthLayout } from "@/lib/adapters/synth-layout-adapter";
import { categoryScale, roundFactor, scaleFactors, scaleRect } from "@/lib/instrument/geometry";
import type { ControlCategory } from "@/lib/instrument/layout";

const CAT = "cat-0000aaaa";
const category: ControlCategory = { id: CAT, name: "Filter", color: "#43a047" };

describe("scale factors", () => {
  it("reads a missing, proportional or separate scale", () => {
    expect(scaleFactors(undefined)).toEqual({ x: 1, y: 1 });
    expect(scaleFactors(1.5)).toEqual({ x: 1.5, y: 1.5 });
    expect(scaleFactors({ x: 2, y: 0.5 })).toEqual({ x: 2, y: 0.5 });
  });

  it("finds a control's factors through its category", () => {
    const categories = [{ ...category, scale: 2 }];
    expect(categoryScale(categories, CAT)).toEqual({ x: 2, y: 2 });
    expect(categoryScale(categories, undefined)).toEqual({ x: 1, y: 1 });
    expect(categoryScale(categories, "cat-ffffffff")).toEqual({ x: 1, y: 1 });
  });

  it("keeps round controls round with the smaller factor and scales rectangles per axis", () => {
    expect(roundFactor({ x: 2, y: 0.5 })).toBe(0.5);
    expect(scaleRect({ width: 34, height: 32, cornerRadius: 5 }, { x: 2, y: 0.5 })).toEqual({ width: 68, height: 16, cornerRadius: 2.5 });
  });
});

describe("rescaleCategory", () => {
  it("stores factors and drops the default proportional 1", () => {
    const scaled = rescaleCategory([category], CAT, 2);
    expect(scaled[0]!.scale).toBe(2);
    expect(rescaleCategory(scaled, CAT, 1)[0]).not.toHaveProperty("scale");
  });

  it("keeps separate factors even when they are equal, so the choice stays", () => {
    expect(rescaleCategory([category], CAT, { x: 1, y: 1 })[0]!.scale).toEqual({ x: 1, y: 1 });
  });
});

describe("stored category scale", () => {
  const panel = { width: 800, height: 400 };
  const draft = (scale: unknown) => ({
    displayName: "Scaled",
    slug: "scaled-synth",
    categories: [{ ...category, scale }],
    controls: [{ id: "knob-1a2b3c4d", kind: "knob", label: "Cutoff", x: 100, y: 100, category: CAT }],
  });

  it.each([[2], [{ x: 2, y: 0.5 }]])("writes schemaMinor 4 and reads %j back", (scale) => {
    const parsed = parseSynthDraft(draft(scale));
    if (!parsed.ok) throw new Error("fixture invalid");
    const result = draftToLayout(parsed.draft, panel, 1);
    if (!result.ok) throw new Error("mapping failed");
    expect(result.layout.schemaMinor).toBe(4);
    expect(result.layout.categories?.[0]?.scale).toEqual(scale);
    expect(parseSynthLayout(JSON.parse(JSON.stringify(result.layout)))).toEqual(result.layout);
    expect(parseSynthLayout(JSON.parse(JSON.stringify({ ...result.layout, schemaMinor: 3 })))).toBeNull();
  });

  it.each([[0.1], [5], [{ x: 2, y: 4.5 }], ["2"]])("rejects the factor %j", (scale) => {
    expect(parseSynthDraft(draft(scale)).ok).toBe(false);
  });

  it("keeps categories without a scale at schemaMinor 2", () => {
    const parsed = parseSynthDraft({ ...draft(undefined), categories: [category] });
    if (!parsed.ok) throw new Error("fixture invalid");
    const result = draftToLayout(parsed.draft, panel, 1);
    expect(result.ok && result.layout.schemaMinor).toBe(2);
  });
});
