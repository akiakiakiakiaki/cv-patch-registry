import { describe, expect, it } from "vitest";
import { draftToLayout, parseSynthDraft, parseSynthLayout } from "@/lib/adapters/synth-layout-adapter";
import { encodeInstrumentLayout } from "@/lib/adapters/instrument-layout-adapter";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";

const panel = { width: 800, height: 400 };

function draftInput(overrides: Record<string, unknown> = {}) {
  return {
    displayName: "Test Synth",
    slug: "test-synth",
    controls: [
      { id: "knob-1a2b3c4d", kind: "knob", label: "Knob 1", x: 100, y: 100 },
      { id: "switch-1a2b3c4e", kind: "switch", label: "Switch 1", x: 200, y: 100 },
      { id: "led-1a2b3c4f", kind: "led", label: "LED 1", x: 300, y: 100, color: "amber" },
      { id: "out-1a2b3c50", kind: "out", label: "Out 1", x: 100, y: 300 },
      { id: "in-1a2b3c51", kind: "in", label: "In 1", x: 700, y: 300 },
    ],
    ...overrides,
  };
}

describe("synth draft parsing", () => {
  it("accepts a valid draft", () => {
    expect(parseSynthDraft(draftInput()).ok).toBe(true);
  });

  it("rejects a slug with uppercase letters or spaces", () => {
    expect(parseSynthDraft(draftInput({ slug: "Bad Slug" }))).toMatchObject({ ok: false });
  });

  it("rejects control IDs that do not follow the generated pattern", () => {
    const bad = draftInput({ controls: [{ id: "knob-XYZ", kind: "knob", label: "K", x: 1, y: 1 }] });
    expect(parseSynthDraft(bad)).toMatchObject({ ok: false });
  });

  it("rejects duplicate control IDs", () => {
    const duplicated = draftInput();
    duplicated.controls.push({ ...duplicated.controls[0]!, label: "Copy" });
    expect(parseSynthDraft(duplicated)).toEqual({ ok: false, issues: ["controls.knob-1a2b3c4d"] });
  });

  it("trims names and rejects empty labels", () => {
    const parsed = parseSynthDraft(draftInput({ displayName: "  Padded  " }));
    expect(parsed.ok && parsed.draft.displayName).toBe("Padded");
    const empty = draftInput({ controls: [{ id: "knob-1a2b3c4d", kind: "knob", label: "   ", x: 1, y: 1 }] });
    expect(parseSynthDraft(empty)).toMatchObject({ ok: false });
  });
});

describe("draft to layout mapping", () => {
  it("maps controls to their collections and ports", () => {
    const parsed = parseSynthDraft(draftInput());
    if (!parsed.ok) throw new Error("fixture invalid");
    const result = draftToLayout(parsed.draft, panel, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layout.knobs.map((knob) => knob.id)).toEqual(["knob-1a2b3c4d"]);
    expect(result.layout.leds[0]).toMatchObject({ id: "led-1a2b3c4f", color: "amber" });
    expect(result.layout.ports.map((port) => port.kind)).toEqual(["out", "in"]);
    expect(result.layout.viewBox).toEqual(panel);
    expect(result.layout).not.toHaveProperty("schemaMinor");
  });

  it("writes schemaMinor 1 when a uni port is used", () => {
    const parsed = parseSynthDraft(draftInput({ controls: [{ id: "uni-1a2b3c52", kind: "uni", label: "Uni 1", x: 10, y: 10 }] }));
    if (!parsed.ok) throw new Error("fixture invalid");
    const result = draftToLayout(parsed.draft, panel, 1);
    expect(result.ok && result.layout.schemaMinor).toBe(1);
  });

  it("rejects controls outside the panel", () => {
    const parsed = parseSynthDraft(draftInput({ controls: [{ id: "knob-1a2b3c4d", kind: "knob", label: "K", x: 900, y: 10 }] }));
    if (!parsed.ok) throw new Error("fixture invalid");
    expect(draftToLayout(parsed.draft, panel, 1)).toEqual({ ok: false, issues: ["controls.knob-1a2b3c4d.position"] });
  });

  it("uses the Proton geometry and angles as defaults", () => {
    const parsed = parseSynthDraft(draftInput());
    if (!parsed.ok) throw new Error("fixture invalid");
    const result = draftToLayout(parsed.draft, panel, 1);
    if (!result.ok) throw new Error("mapping failed");
    expect(result.layout.geometry).toEqual(behringerProton.layout.geometry);
    expect([result.layout.knobStartAngle, result.layout.knobSweepAngle]).toEqual([119, 299]);
  });
});

describe("stored layout parsing", () => {
  it("reads back a mapped layout", () => {
    const parsed = parseSynthDraft(draftInput());
    if (!parsed.ok) throw new Error("fixture invalid");
    const result = draftToLayout(parsed.draft, panel, 1);
    if (!result.ok) throw new Error("mapping failed");
    expect(parseSynthLayout(JSON.parse(JSON.stringify(result.layout)))).toEqual(result.layout);
  });

  it("rejects a uni port without schemaMinor 1", () => {
    const parsed = parseSynthDraft(draftInput({ controls: [{ id: "uni-1a2b3c52", kind: "uni", label: "Uni 1", x: 10, y: 10 }] }));
    if (!parsed.ok) throw new Error("fixture invalid");
    const result = draftToLayout(parsed.draft, panel, 1);
    if (!result.ok) throw new Error("mapping failed");
    const withoutMinor = { ...result.layout, schemaMinor: undefined };
    expect(parseSynthLayout(JSON.parse(JSON.stringify(withoutMinor)))).toBeNull();
  });

  it("reads the built-in Proton layout", () => {
    expect(parseSynthLayout(JSON.parse(JSON.stringify(encodeInstrumentLayout(behringerProton.layout))))).not.toBeNull();
  });

  it("rejects a layout with positions outside its viewBox", () => {
    const broken = JSON.parse(JSON.stringify(encodeInstrumentLayout(behringerProton.layout)));
    broken.knobs[0].x = broken.viewBox.width + 10;
    expect(parseSynthLayout(broken)).toBeNull();
  });
});
