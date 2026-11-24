import { describe, expect, it } from "vitest";
import {
  CLONE_NORMAL_CATEGORY,
  CLONE_SHIFT_CATEGORY,
  PROTON_CLONE_PANEL,
  PROTON_CLONE_SLUG,
  buildProtonCloneLayout,
  cloneControlId,
  clonePosition,
  migrateLegacyPatchData,
} from "@/lib/adapters/proton-legacy-migration-adapter";
import { normalizeSubmittedData } from "@/lib/adapters/patch-document-adapter";
import { CONTROL_ID_PATTERN, draftToLayout, parseSynthLayout } from "@/lib/adapters/synth-layout-adapter";
import { controlsFromLayout } from "@/components/synth-editor/draft-state";
import { categoryIssues, categoryStateKey } from "@/lib/domain/switch-categories";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";

const legacy = behringerProton.layout;
const clone = buildProtonCloneLayout();
const id = (kind: Parameters<typeof cloneControlId>[0], legacyId: string) => cloneControlId(kind, legacyId);
const shift = id("switch", "Shift");

describe("clone control IDs", () => {
  it("are editor-style, unique and the same on every call", () => {
    const all = [...clone.knobs, ...clone.switches, ...clone.leds, ...clone.ports].map((control) => control.id);
    expect(all).toHaveLength(legacy.knobs.length + legacy.switches.length + legacy.leds.length + legacy.ports.length);
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((value) => CONTROL_ID_PATTERN.test(value))).toBe(true);
    expect(id("knob", "Tune 1")).toBe(id("knob", "Tune 1"));
    expect(id("knob", "Tune 1")).not.toBe(id("knob", "Tune 2"));
  });
});

describe("clone layout", () => {
  it("is a valid stored layout with the legacy controls, labels and LED colors", () => {
    expect(parseSynthLayout(clone)).not.toBeNull();
    expect(clone).toMatchObject({ id: PROTON_CLONE_SLUG, schemaMinor: 2, viewBox: PROTON_CLONE_PANEL });
    expect(clone.knobs.map((knob) => knob.label)).toEqual(legacy.knobs.map((knob) => knob.id));
    expect(clone.ports.map((port) => [port.label, port.kind])).toEqual(legacy.ports.map((port) => [port.label, port.kind]));
    expect(clone.leds.map((led) => led.color)).toEqual(legacy.leds.map((led) => led.color));
    expect(categoryIssues(clone)).toEqual([]);
  });

  it("makes Shift a selector between Normal and Shift, with the nine dual-channel switches depending on it", () => {
    expect(clone.categories).toEqual([CLONE_NORMAL_CATEGORY, CLONE_SHIFT_CATEGORY]);
    expect(clone.switches.find((control) => control.id === shift)).toMatchObject({ label: "Shift", selects: [CLONE_NORMAL_CATEGORY.id, CLONE_SHIFT_CATEGORY.id] });
    const dependents = clone.switches.filter((control) => control.dependsOn === shift).map((control) => control.label);
    expect(dependents.sort()).toEqual(["1 shot", "Bounce", "Invert", "Loop", "Retrig ASR", "Retrig LFO", "Reverse", "Sustain", "Sync LFO"]);
    expect(clone.switches.filter((control) => !control.selects && !control.dependsOn)).toHaveLength(12);
  });

  it("survives a round trip through the editor unchanged", () => {
    const draft = { displayName: clone.displayName, slug: clone.id, categories: [...clone.categories!], controls: controlsFromLayout(clone) };
    expect(draftToLayout(draft, PROTON_CLONE_PANEL, clone.layoutVersion)).toEqual({ ok: true, layout: clone });
  });
});

describe("clonePosition", () => {
  it("removes the legacy margin beside the artwork and scales onto the clone panel", () => {
    const artworkWidth = legacy.viewBox.height * (3807.29 / 1214);
    const margin = (legacy.viewBox.width - artworkWidth) / 2;
    expect(clonePosition({ x: margin, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(clonePosition({ x: legacy.viewBox.width / 2, y: legacy.viewBox.height / 2 })).toEqual({ x: 1024, y: 326.5 });
    expect(clonePosition({ x: margin + artworkWidth, y: legacy.viewBox.height })).toEqual({ x: 2048, y: 653 });
  });

  it("keeps every control inside the clone panel", () => {
    for (const control of [...clone.knobs, ...clone.switches, ...clone.leds, ...clone.ports]) {
      expect(control.x).toBeGreaterThanOrEqual(0);
      expect(control.x).toBeLessThanOrEqual(PROTON_CLONE_PANEL.width);
      expect(control.y).toBeLessThanOrEqual(PROTON_CLONE_PANEL.height);
    }
  });
});

describe("migrateLegacyPatchData", () => {
  const legacyData = {
    knobs: { "Tune 1": 64, Ghost: 3 },
    switches: { Sync: true, Loop: true, "Loop::blue": false, "Bounce::blue": true, "Shift::blue": true, "Sync::blue": true, Ghost: true },
    leds: { "OSC1 octave 8": true },
    cables: [
      { from: legacy.ports.find((port) => port.kind === "out")!.id, to: legacy.ports.find((port) => port.kind === "in")!.id, colorId: "red" as const },
      { from: "gone", to: "in-0", colorId: "blue" as const },
    ],
  };
  const migrated = migrateLegacyPatchData(legacyData);

  it("keeps every value under its new ID and drops unknown controls", () => {
    expect(migrated.knobs).toEqual({ [id("knob", "Tune 1")]: 64 });
    expect(migrated.leds).toEqual({ [id("led", "OSC1 octave 8")]: true });
    expect(migrated.cables).toEqual([
      { from: clone.ports.find((port) => port.kind === "out")!.id, to: clone.ports.find((port) => port.kind === "in")!.id, colorId: "red" },
    ]);
  });

  it("moves red and blue channel states to the Normal and Shift categories and keeps the selected channel", () => {
    expect(migrated.switches).toEqual({
      [id("switch", "Sync")]: true,
      [categoryStateKey(id("switch", "Loop"), CLONE_NORMAL_CATEGORY.id)]: true,
      [categoryStateKey(id("switch", "Loop"), CLONE_SHIFT_CATEGORY.id)]: false,
      [categoryStateKey(id("switch", "Bounce"), CLONE_SHIFT_CATEGORY.id)]: true,
      [categoryStateKey(shift, CLONE_SHIFT_CATEGORY.id)]: true,
    });
  });

  it("produces only states the clone layout accepts", () => {
    expect(normalizeSubmittedData(migrated, clone)).toEqual(migrated);
  });
});
