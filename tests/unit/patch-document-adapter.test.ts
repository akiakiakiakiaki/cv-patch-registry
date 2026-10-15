import { describe, expect, it } from "vitest";
import { decodePatchDocument, encodePatchDocument, normalizeSubmittedData } from "@/lib/adapters/patch-document-adapter";
import { testLayout } from "../fixtures/instrument";

const uniLayout = { ...testLayout, ports: [...testLayout.ports, { id: "uni-a", label: "Uni A", kind: "uni" as const, x: 900, y: 500 }] };

describe("patch document encoding", () => {
  it("writes version 1 without schemaMinor for plain cables", () => {
    const data = normalizeSubmittedData({ knobs: { "Test knob": 64 }, cables: [{ from: "out-a", to: "in-a", colorId: "red" }] }, uniLayout);
    const document = encodePatchDocument(data, uniLayout);
    expect(document).toMatchObject({ schemaVersion: 1, knobs: { "Test knob": 64 } });
    expect(document).not.toHaveProperty("schemaMinor");
  });

  it("writes schemaMinor 1 when a cable uses a uni port", () => {
    const data = normalizeSubmittedData({ cables: [{ from: "uni-a", to: "in-a", colorId: "red" }] }, uniLayout);
    expect(encodePatchDocument(data, uniLayout)).toMatchObject({ schemaMinor: 1 });
  });

  it("round-trips through decode", () => {
    const data = normalizeSubmittedData(
      { knobs: { "Test knob": 10 }, switches: { "Test switch": true }, leds: { "Test LED": true }, cables: [{ from: "uni-a", to: "in-a", colorId: "blue" }] },
      uniLayout,
    );
    const stored = JSON.parse(JSON.stringify(encodePatchDocument(data, uniLayout)));
    expect(decodePatchDocument(stored, uniLayout)).toEqual(data);
  });
});

describe("patch document decoding", () => {
  it("rejects a different major version", () => {
    expect(decodePatchDocument({ schemaVersion: 2, knobs: {}, switches: {}, leds: {}, cables: [] }, uniLayout)).toBeNull();
  });

  it("rejects a newer minor than supported", () => {
    expect(decodePatchDocument({ schemaVersion: 1, schemaMinor: 2, knobs: {}, switches: {}, leds: {}, cables: [] }, uniLayout)).toBeNull();
  });

  it("drops values for controls the revision does not have", () => {
    const decoded = decodePatchDocument({ schemaVersion: 1, knobs: { "Test knob": 5, "Removed knob": 9 }, switches: {}, leds: {}, cables: [] }, uniLayout);
    expect(decoded?.knobs).toEqual({ "Test knob": 5 });
  });

  it("drops cables that point at unknown ports", () => {
    const decoded = decodePatchDocument({ schemaVersion: 1, knobs: {}, switches: {}, leds: {}, cables: [{ from: "out-a", to: "gone", colorId: "red" }] }, uniLayout);
    expect(decoded?.cables).toEqual([]);
  });
});
