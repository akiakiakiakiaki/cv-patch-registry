import { describe, expect, it } from "vitest";
import { decodeImport, decodeLibrary, encodeLibrary, normalizePatchData, requiredPatchSchemaMinor } from "@/lib/adapters/patch-adapter";
import { createEmptyLibrary } from "@/lib/domain/patch-service";
import type { InstrumentDefinition } from "@/lib/instruments/types";
import { testInstrument, testLayout } from "../fixtures/instrument";

const uniInstrument: InstrumentDefinition = {
  ...testInstrument,
  layout: {
    ...testLayout,
    ports: [...testLayout.ports, { id: "uni-a", label: "Uni A", kind: "uni", x: 900, y: 500 }],
  },
};

describe("cables with uni ports", () => {
  it("accepts uni to in and keeps the dragged direction", () => {
    const data = normalizePatchData(
      { cables: [{ from: "uni-a", to: "in-a", colorId: "red" }] },
      uniInstrument,
    );
    expect(data.cables).toEqual([{ from: "uni-a", to: "in-a", colorId: "red" }]);
  });

  it("accepts uni to uni and keeps the direction", () => {
    const data = normalizePatchData(
      { cables: [{ from: "uni-a", to: "out-a", colorId: "blue" }] },
      uniInstrument,
    );
    expect(data.cables).toEqual([{ from: "uni-a", to: "out-a", colorId: "blue" }]);
  });

  it("still rejects in to in and out to out", () => {
    const data = normalizePatchData(
      {
        cables: [
          { from: "in-a", to: "in-b", colorId: "red" },
          { from: "out-a", to: "out-b", colorId: "red" },
        ],
      },
      uniInstrument,
    );
    expect(data.cables).toEqual([]);
  });

  it("rejects a cable from a port to itself, even for uni", () => {
    const data = normalizePatchData({ cables: [{ from: "uni-a", to: "uni-a", colorId: "red" }] }, uniInstrument);
    expect(data.cables).toEqual([]);
  });

  it("still allows one cable per port", () => {
    const data = normalizePatchData(
      {
        cables: [
          { from: "uni-a", to: "in-a", colorId: "red" },
          { from: "out-a", to: "uni-a", colorId: "red" },
        ],
      },
      uniInstrument,
    );
    expect(data.cables).toHaveLength(1);
  });
});

describe("patch export versioning", () => {
  it("needs schemaMinor 1 only when a cable uses a uni port", () => {
    const plain = createEmptyLibrary();
    expect(requiredPatchSchemaMinor(plain, uniInstrument)).toBe(0);

    const withUni = {
      ...plain,
      patches: plain.patches.map((patch) => ({
        ...patch,
        data: { ...patch.data, cables: [{ from: "uni-a", to: "in-a", colorId: "red" as const }] },
      })),
    };
    expect(requiredPatchSchemaMinor(withUni, uniInstrument)).toBe(1);
  });

  it("omits schemaMinor for plain exports", () => {
    expect(encodeLibrary(createEmptyLibrary(), "test-synth", "2026-01-01T00:00:00.000Z")).not.toHaveProperty("schemaMinor");
  });

  it("round-trips a uni export and reads it back", () => {
    const library = createEmptyLibrary(new Date("2026-01-01T00:00:00Z"));
    const exported = encodeLibrary(library, "test-synth", "2026-01-01T00:00:00.000Z", 1);
    expect(exported).toMatchObject({ schemaMinor: 1 });
    expect(decodeLibrary(JSON.parse(JSON.stringify(exported)), uniInstrument)).not.toBeNull();
  });

  it("rejects an export with a newer schemaMinor on decode and import", () => {
    const newer = { ...encodeLibrary(createEmptyLibrary(), "test-synth"), schemaMinor: 2 };
    expect(decodeLibrary(newer, uniInstrument)).toBeNull();
    expect(() => decodeImport(newer, uniInstrument)).toThrow("status.importUnsupportedVersion");
  });
});
