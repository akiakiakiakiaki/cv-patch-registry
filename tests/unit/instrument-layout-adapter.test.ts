import { describe, expect, it } from "vitest";
import { decodeInstrumentLayout } from "@/lib/adapters/instrument-layout-adapter";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";

const reference = behringerProton.layout;

describe("instrument layout adapter", () => {
  it("accepts a matching versioned layout and uses its adjusted coordinates", () => {
    const candidate = structuredClone(reference);
    const firstKnob = candidate.knobs[0]!;
    firstKnob.x += 1;

    const decoded = decodeInstrumentLayout(candidate, reference);

    expect(decoded?.knobs[0]?.x).toBe(firstKnob.x);
    expect(decoded?.geometry).toEqual(reference.geometry);
  });

  it("normalizes decoded positions to whole or half pixels", () => {
    const candidate = structuredClone(reference);
    candidate.knobs[0]!.x = 114.13;
    candidate.knobs[0]!.y = 173.62;

    const decoded = decodeInstrumentLayout(candidate, reference);

    expect(decoded?.knobs[0]).toMatchObject({ x: 114, y: 173.5 });
  });

  it.each([
    ["synth ID", { id: "other" }],
    ["schema version", { schemaVersion: 99 }],
    ["layout version", { layoutVersion: 99 }],
    ["display name", { displayName: "Other" }],
    ["viewBox", { viewBox: { width: 1, height: 1 } }],
  ])("rejects a mismatched %s", (_description, change) => {
    expect(decodeInstrumentLayout({ ...reference, ...change }, reference)).toBeNull();
  });

  it("rejects changed control order, missing controls, and out-of-range coordinates", () => {
    const reordered = structuredClone(reference);
    reordered.knobs = [reordered.knobs[1]!, reordered.knobs[0]!, ...reordered.knobs.slice(2)];
    expect(decodeInstrumentLayout(reordered, reference)).toBeNull();

    const missing = structuredClone(reference);
    missing.ports = missing.ports.slice(0, -1);
    expect(decodeInstrumentLayout(missing, reference)).toBeNull();

    const outside = structuredClone(reference);
    outside.leds[0]!.x = reference.viewBox.width + 1;
    expect(decodeInstrumentLayout(outside, reference)).toBeNull();
  });

  it("accepts the supported legacy Proton layout without displayName and layoutVersion", () => {
    const { displayName: _displayName, layoutVersion: _layoutVersion, ...legacy } = reference;
    expect(decodeInstrumentLayout(legacy, reference)).toMatchObject({
      displayName: reference.displayName,
      layoutVersion: reference.layoutVersion,
    });
  });
});
