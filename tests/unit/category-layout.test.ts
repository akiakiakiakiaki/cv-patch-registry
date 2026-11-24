import { describe, expect, it } from "vitest";
import { encodeInstrumentLayout } from "@/lib/adapters/instrument-layout-adapter";
import { decodePatchDocument, encodePatchDocument, normalizeSubmittedData } from "@/lib/adapters/patch-document-adapter";
import { draftControlsFromLayout, draftToLayout, parseSynthLayout } from "@/lib/adapters/synth-layout-adapter";
import { categoryClass, categoryStyleSheet } from "@/components/instrument-panel/category-styles";
import { categoryStateKey } from "@/lib/domain/switch-categories";
import { createLayoutSwitchAdapter } from "@/lib/instruments/generic-switch-adapter";
import { findRevisionLosses } from "@/lib/patches/revision-loss";
import { testLayout } from "../fixtures/instrument";
import { DEPENDENT, KNOB, NORMAL, PLAIN, SELECTOR, SHIFT, THIRD, categoryLayout } from "../fixtures/categories";

const stored = { ...encodeInstrumentLayout(categoryLayout), id: "test-synth" };

describe("stored layouts with categories", () => {
  it("are written with schema minor 2 and read back unchanged", () => {
    expect(stored.schemaMinor).toBe(2);
    expect(parseSynthLayout(stored)).toMatchObject({ categories: categoryLayout.categories, switches: categoryLayout.switches });
  });

  it("are rejected below minor 2, with invalid colors or IDs, or with inconsistent roles", () => {
    expect(parseSynthLayout({ ...stored, schemaMinor: 1 })).toBeNull();
    expect(parseSynthLayout({ ...stored, categories: [{ id: NORMAL, name: "Normal", color: "red" }] })).toBeNull();
    expect(parseSynthLayout({ ...stored, categories: [{ id: "normal", name: "Normal", color: "#ff0000" }] })).toBeNull();
    expect(parseSynthLayout({ ...stored, switches: [{ ...categoryLayout.switches[1]! }] })).toBeNull();
  });

  it("keeps layouts without categories at their previous minor", () => {
    expect(encodeInstrumentLayout(testLayout).schemaMinor).toBeUndefined();
    expect(encodeInstrumentLayout({ ...testLayout, categories: [] })).not.toHaveProperty("categories");
  });
});

describe("editor drafts with categories", () => {
  const controls = [
    { id: KNOB, kind: "knob" as const, label: "Cutoff", x: 100, y: 100, category: SHIFT },
    { id: SELECTOR, kind: "switch" as const, label: "Shift", x: 200, y: 100, selects: [NORMAL, SHIFT, THIRD] },
    { id: DEPENDENT, kind: "switch" as const, label: "Loop", x: 300, y: 100, dependsOn: SELECTOR },
    { id: PLAIN, kind: "switch" as const, label: "Sync", x: 400, y: 100, category: THIRD },
  ];
  const draft = { displayName: "Mine", slug: "mine-synth", categories: [...categoryLayout.categories!], controls };

  it("carry categories and switch roles into the layout", () => {
    const built = draftToLayout(draft, { width: 1000, height: 600 }, 2);
    expect(built.ok && built.layout).toMatchObject({
      schemaMinor: 2,
      categories: categoryLayout.categories,
      knobs: [{ id: KNOB, category: SHIFT }],
      switches: [
        { id: SELECTOR, selects: [NORMAL, SHIFT, THIRD] },
        { id: DEPENDENT, dependsOn: SELECTOR },
        { id: PLAIN, category: THIRD },
      ],
    });
  });

  it("report inconsistent roles instead of saving them", () => {
    const broken = { ...draft, controls: controls.map((control) => (control.id === SELECTOR ? { ...control, selects: [NORMAL] } : control)) };
    expect(draftToLayout(broken, { width: 1000, height: 600 }, 2)).toEqual({ ok: false, issues: ["categories.selector-too-few"] });
  });
});

describe("patch data on a layout with categories", () => {
  it("keeps per-category states through save and load", () => {
    const data = normalizeSubmittedData(
      { switches: { [categoryStateKey(SELECTOR, SHIFT)]: true, [categoryStateKey(DEPENDENT, SHIFT)]: true, [categoryStateKey(DEPENDENT, NORMAL)]: false, [PLAIN]: true, [DEPENDENT]: true } },
      categoryLayout,
    );
    const expected = { [categoryStateKey(SELECTOR, SHIFT)]: true, [categoryStateKey(DEPENDENT, SHIFT)]: true, [categoryStateKey(DEPENDENT, NORMAL)]: false, [PLAIN]: true };
    expect(data.switches).toEqual(expected);
    expect(decodePatchDocument(encodePatchDocument(data, categoryLayout), categoryLayout)?.switches).toEqual(expected);
  });

  it("reports per-category states a newer revision cannot keep, with the category name", () => {
    const withoutRole = { ...categoryLayout, switches: categoryLayout.switches.map((control) => (control.id === DEPENDENT ? { id: DEPENDENT, label: "Loop", x: 300, y: 100 } : control)) };
    const losses = findRevisionLosses({ switches: { [categoryStateKey(DEPENDENT, SHIFT)]: true } }, categoryLayout, withoutRole);
    expect(losses).toEqual([{ kind: "switch", id: categoryStateKey(DEPENDENT, SHIFT), label: "Loop (Shift)", value: true }]);
  });
});

describe("layout switch adapter", () => {
  it("reports the category to color a switch with, and all keys one click changes", () => {
    const adapter = createLayoutSwitchAdapter(categoryLayout);
    expect(adapter.getState({}, PLAIN)).toEqual({ active: false, color: "blue", categoryId: THIRD, stateKey: PLAIN });
    expect(adapter.getState({}, "unknown")).toEqual({ active: false, color: "blue", stateKey: "unknown" });
    expect(adapter.toggle({}, SELECTOR)).toEqual({
      [categoryStateKey(SELECTOR, NORMAL)]: false,
      [categoryStateKey(SELECTOR, SHIFT)]: true,
      [categoryStateKey(SELECTOR, THIRD)]: false,
    });
  });
});

describe("category style sheet", () => {
  it("writes one scoped rule per category", () => {
    expect(categoryStyleSheet("r1", categoryLayout.categories)).toBe(
      [
        `[data-category-scope="r1"] .${NORMAL}{--category-color:#e53935}`,
        `[data-category-scope="r1"] .${SHIFT}{--category-color:#1e88e5}`,
        `[data-category-scope="r1"] .${THIRD}{--category-color:#43a047}`,
      ].join("\n"),
    );
  });

  it("skips categories whose ID or color could inject CSS", () => {
    const hostile = [
      { id: "cat-00000001", name: "x", color: "red;}body{display:none" },
      { id: "x}body{", name: "y", color: "#000000" },
    ];
    expect(categoryStyleSheet('s"]{}', hostile)).toBe("");
    expect(categoryClass("x}body{")).toBe("");
    expect(categoryClass(SHIFT)).toBe(SHIFT);
  });
});

describe("LED categories", () => {
  const withLed = { ...categoryLayout, leds: [{ id: "led-00000001", label: "Gate", x: 500, y: 100, color: "red" as const, category: SHIFT }] };

  it("are stored with schema minor 2 and read back", () => {
    const encoded = { ...encodeInstrumentLayout({ ...testLayout, categories: categoryLayout.categories, leds: withLed.leds }), id: "test-synth" };
    expect(encoded.schemaMinor).toBe(2);
    expect(parseSynthLayout(encoded)?.leds).toEqual(withLed.leds);
    expect(parseSynthLayout({ ...encoded, leds: [{ ...withLed.leds[0]!, category: "cat-ffffffff" }] })).toBeNull();
  });

  it("go through the editor unchanged and keep the fixed color as fallback", () => {
    const layout = { ...encodeInstrumentLayout(withLed), id: "mine-synth" };
    const draft = { displayName: layout.displayName, slug: layout.id, categories: [...layout.categories!], controls: draftControlsFromLayout(layout) };
    expect(draft.controls.find((control) => control.kind === "led")).toMatchObject({ color: "red", category: SHIFT });
    const built = draftToLayout(draft, layout.viewBox, layout.layoutVersion);
    expect(built.ok && built.layout.leds).toEqual(withLed.leds);
  });
});

