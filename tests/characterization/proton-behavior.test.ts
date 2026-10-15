import { describe, expect, it } from "vitest";
import protonLayoutJson from "@/lib/instrument/behringer-proton/behringer-proton-layout.json";
import { decodeInstrumentLayout } from "@/lib/adapters/instrument-layout-adapter";
import { decodeImport, decodeLibrary, encodeLibrary, normalizePatchData } from "@/lib/adapters/patch-adapter";
import { createEmptyLibrary } from "@/lib/domain/patch-service";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";

const protonPorts = behringerProton.layout.ports;
const firstOut = protonPorts.find((port) => port.kind === "out")!;
const firstIn = protonPorts.find((port) => port.kind === "in")!;
const secondIn = protonPorts.filter((port) => port.kind === "in")[1]!;

describe("Proton characterization", () => {
  it("accepts the shipped layout file as its own reference", () => {
    const decoded = decodeInstrumentLayout(protonLayoutJson as unknown, behringerProton.layout);
    expect(decoded).not.toBeNull();
    expect(decoded?.knobs).toHaveLength(behringerProton.layout.knobs.length);
    expect(decoded?.ports.map((port) => port.id)).toEqual(protonPorts.map((port) => port.id));
  });

  it("rejects a layout whose control IDs were changed", () => {
    const broken = structuredClone(protonLayoutJson) as unknown as { knobs: { id: string }[] };
    broken.knobs[0]!.id = "Renamed";
    expect(decodeInstrumentLayout(broken, behringerProton.layout)).toBeNull();
  });

  it("normalizes cables to out to in and drops in-in pairs", () => {
    const data = normalizePatchData(
      {
        cables: [
          { from: firstIn.id, to: firstOut.id, colorId: "red" },
          { from: firstIn.id, to: secondIn.id, colorId: "red" },
        ],
      },
      behringerProton,
    );
    expect(data.cables).toEqual([{ from: firstOut.id, to: firstIn.id, colorId: "red" }]);
  });

  it("keeps a legacy Proton patch library without format fields importable", () => {
    const decoded = decodeImport(
      {
        patches: [{ id: "legacy-1", name: "Legacy", data: { knobs: { "Tune 1": 64 }, switches: {}, leds: {}, cables: [] } }],
      },
      behringerProton,
    );
    expect(decoded.hasStableIds).toBe(true);
    expect(decoded.patches[0]).toMatchObject({ id: "legacy-1", name: "Legacy" });
    expect(decoded.patches[0]!.data.knobs["Tune 1"]).toBe(64);
  });

  it("round-trips an exported library with format, schemaVersion and instrumentId", () => {
    const library = createEmptyLibrary(new Date("2026-01-01T00:00:00Z"), "Round trip");
    const exported = encodeLibrary(library, behringerProton.id, "2026-01-01T00:00:00.000Z");
    expect(exported).toMatchObject({ format: "synth-patch-library", schemaVersion: 1, instrumentId: "behringer-proton" });
    expect(decodeLibrary(JSON.parse(JSON.stringify(exported)), behringerProton)).toEqual(library);
  });

  it("rejects an export for a different instrument", () => {
    const exported = encodeLibrary(createEmptyLibrary(), "other-synth");
    expect(decodeLibrary(exported, behringerProton)).toBeNull();
  });

  it("keeps the Proton viewBox and knob angles unchanged", () => {
    const { viewBox, knobStartAngle, knobSweepAngle } = behringerProton.layout;
    expect(viewBox).toEqual({ width: 2048, height: 650.88 });
    expect([knobStartAngle, knobSweepAngle]).toEqual([119, 299]);
  });
});
