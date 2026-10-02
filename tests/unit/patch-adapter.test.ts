import { describe, expect, it } from "vitest";
import {
  associateLegacyPatches,
  decodeImport,
  decodeLibrary,
  encodeLibrary,
  normalizePatchData,
  parseJson,
} from "@/lib/adapters/patch-adapter";
import { createEmptyLibrary } from "@/lib/domain/patch-service";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";

const now = "2026-01-01T00:00:00.000Z";
const instrument = behringerProton;
const output = instrument.layout.ports.find((port) => port.kind === "out")!;
const secondOutput = instrument.layout.ports.find(
  (port) => port.kind === "out" && port.id !== output.id,
)!;
const inputs = instrument.layout.ports.filter((port) => port.kind === "in");
const input = inputs[0]!;

describe("patch adapter", () => {
  it("encodes and decodes a versioned library for its synth", () => {
    const library = createEmptyLibrary(new Date(now), "Init");
    const encoded = encodeLibrary(library, instrument.id, now);

    expect(encoded).toMatchObject({
      format: "synth-patch-library",
      schemaVersion: 1,
      instrumentId: "behringer-proton",
      exportedAt: now,
    });
    expect(decodeLibrary(encoded, instrument)).toEqual(library);
  });

  it("rejects incompatible library versions and instrument IDs", () => {
    const encoded = encodeLibrary(createEmptyLibrary(new Date(now)), instrument.id, now);
    expect(decodeLibrary({ ...encoded, schemaVersion: 2 }, instrument)).toBeNull();
    expect(decodeLibrary({ ...encoded, instrumentId: "other-synth" }, instrument)).toBeNull();
  });

  it("normalizes valid cables, canonicalizes their direction, and drops invalid or reused ports", () => {
    const nextInput = inputs[1]!;
    const data = normalizePatchData(
      {
        knobs: { good: 45, tooSmall: -10, tooLarge: 500, invalid: Number.NaN },
        switches: { enabled: true, ignored: "yes" },
        leds: { lit: true, ignored: 1 },
        cables: [
          { from: input.id, to: output.id, colorId: "blue" },
          { from: secondOutput.id, to: nextInput.id, colorId: "white" },
          { from: output.id, to: input.id, colorId: "red" },
          { from: input.id, to: nextInput.id, colorId: "black" },
          { from: "missing", to: nextInput.id, colorId: "gray" },
          { from: 5, to: input.id },
        ],
      },
      instrument,
    );

    expect(data.knobs).toEqual({ good: 45, tooSmall: 0, tooLarge: 127 });
    expect(data.switches).toEqual({ enabled: true });
    expect(data.leds).toEqual({ lit: true });
    expect(data.cables).toEqual([
      { from: output.id, to: input.id, colorId: "blue" },
      { from: secondOutput.id, to: nextInput.id, colorId: "white" },
    ]);
  });

  it("reads legacy LED maps and defaults unknown cable colors to red", () => {
    const data = normalizePatchData(
      { circles: { "Wave 1": true }, cables: [{ from: output.id, to: input.id, colorId: "unknown" }] },
      instrument,
    );
    expect(data.leds).toEqual({ "Wave 1": true });
    expect(data.cables[0]?.colorId).toBe("red");
  });

  it("normalizes imported knob values to integer MIDI range", () => {
    expect(normalizePatchData({ knobs: { low: -5, middle: 63.6, high: 500 } }, instrument).knobs).toEqual({
      low: 0,
      middle: 64,
      high: 127,
    });
  });

  it("accepts legacy Proton exports and rejects them for another synth", () => {
    const legacyExport = {
      format: "proton-patch-library",
      patches: [{ id: "legacy-1", name: "Legacy", updatedAt: now, data: {} }],
    };
    expect(decodeImport(legacyExport, instrument).patches[0]?.name).toBe("Legacy");
    expect(() => decodeImport(legacyExport, {
      ...instrument,
      id: "other-synth",
    })).toThrow("status.importWrongInstrument");
    expect(() => decodeImport({ ...legacyExport, schemaVersion: 9 }, instrument)).toThrow(
      "status.importUnsupportedVersion",
    );
  });

  it("rejects unknown formats, invalid patch collections, and malformed JSON", () => {
    expect(() => decodeImport({ format: "unknown", patches: [] }, instrument)).toThrow(
      "status.importUnknownFormat",
    );
    expect(() => decodeImport({ patches: [] }, instrument)).toThrow(
      "status.importErrorPatches",
    );
    expect(() => parseJson("{" )).toThrow(SyntaxError);
  });

  it("associates legacy imports by patch name to preserve local IDs", () => {
    const local = [{
      id: "stable-local-id",
      name: "Init",
      updatedAt: now,
      data: { knobs: {}, switches: {}, leds: {}, cables: [] },
    }];
    const imported = [{ ...local[0]!, id: "generated-id" }];
    expect(associateLegacyPatches(imported, local)[0]?.id).toBe("stable-local-id");
  });
});
