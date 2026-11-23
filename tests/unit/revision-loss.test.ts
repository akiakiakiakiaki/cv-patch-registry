import { describe, expect, it } from "vitest";
import { findRevisionLosses } from "@/lib/patches/revision-loss";

const point = { x: 10, y: 10 };
const from = {
  knobs: [{ id: "knob-00000001", label: "Cutoff", ...point }, { id: "knob-00000002", ...point }],
  switches: [{ id: "switch-00000001", label: "Sync", ...point }],
  leds: [],
  ports: [
    { id: "out-00000001", label: "VCO Out", kind: "out" as const, ...point },
    { id: "in-00000001", label: "Filter In", kind: "in" as const, ...point },
  ],
};

describe("findRevisionLosses", () => {
  it("lists values and cables the newer layout has no control for, with the old labels", () => {
    const to = { knobs: [from.knobs[1]!], switches: [], leds: [], ports: [from.ports[0]!] };
    const losses = findRevisionLosses(
      {
        knobs: { "knob-00000001": 91, "knob-00000002": 5 },
        switches: { "switch-00000001": true },
        cables: [{ from: "out-00000001", to: "in-00000001", colorId: "red" }],
      },
      from,
      to,
    );
    expect(losses).toEqual([
      { kind: "knob", id: "knob-00000001", label: "Cutoff", value: 91 },
      { kind: "switch", id: "switch-00000001", label: "Sync", value: true },
      { kind: "cable", id: "out-00000001:in-00000001", label: "VCO Out → Filter In" },
    ]);
  });

  it("reports nothing when the newer layout only adds controls", () => {
    const to = { ...from, knobs: [...from.knobs, { id: "knob-00000003", label: "New", ...point }] };
    expect(findRevisionLosses({ knobs: { "knob-00000001": 1, "knob-00000003": 2 } }, from, to)).toEqual([]);
  });

  it("falls back to the control ID when the old control had no label", () => {
    const losses = findRevisionLosses({ knobs: { "knob-00000002": 5 } }, from, { knobs: [], switches: [], leds: [], ports: [] });
    expect(losses).toEqual([{ kind: "knob", id: "knob-00000002", label: "knob-00000002", value: 5 }]);
  });
});
