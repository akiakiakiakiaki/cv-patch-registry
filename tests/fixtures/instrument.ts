import type { InstrumentDefinition } from "@/lib/instruments/types";
import type { InstrumentLayout } from "@/lib/instrument/layout";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import { genericSwitchAdapter } from "@/lib/instruments/generic-switch-adapter";

export const testLayout: InstrumentLayout = {
  ...behringerProton.layout,
  id: "test-synth",
  displayName: "Test Synth",
  viewBox: { width: 1000, height: 600 },
  knobs: [{ id: "Test knob", x: 100, y: 100 }],
  switches: [{ id: "Test switch", x: 200, y: 100 }],
  leds: [{ id: "Test LED", x: 300, y: 100, color: "red" }],
  ports: [
    { id: "out-a", label: "Out A", kind: "out", x: 100, y: 300 },
    { id: "out-b", label: "Out B", kind: "out", x: 100, y: 400 },
    { id: "in-a", label: "In A", kind: "in", x: 800, y: 300 },
    { id: "in-b", label: "In B", kind: "in", x: 800, y: 400 },
  ],
};

export const testInstrument: InstrumentDefinition = {
  id: testLayout.id,
  displayName: testLayout.displayName,
  imageSrc: "/test-synth.svg",
  layoutFile: "test-synth-layout.json",
  layout: testLayout,
  switchAdapter: genericSwitchAdapter,
};
