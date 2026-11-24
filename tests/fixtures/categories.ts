import type { InstrumentLayout } from "@/lib/instrument/layout";
import { testLayout } from "./instrument";

export const NORMAL = "cat-0000000a";
export const SHIFT = "cat-0000000b";
export const THIRD = "cat-0000000c";

export const SELECTOR = "switch-00000001";
export const DEPENDENT = "switch-00000002";
export const PLAIN = "switch-00000003";
export const KNOB = "knob-00000001";

/** Three categories; a selector cycling through all three, one dependent, one colored plain switch, one colored knob. */
export const categoryLayout: InstrumentLayout = {
  ...testLayout,
  schemaMinor: 2,
  categories: [
    { id: NORMAL, name: "Normal", color: "#e53935" },
    { id: SHIFT, name: "Shift", color: "#1e88e5" },
    { id: THIRD, name: "Third", color: "#43a047" },
  ],
  knobs: [{ id: KNOB, label: "Cutoff", x: 100, y: 100, category: SHIFT }],
  switches: [
    { id: SELECTOR, label: "Shift", x: 200, y: 100, selects: [NORMAL, SHIFT, THIRD] },
    { id: DEPENDENT, label: "Loop", x: 300, y: 100, dependsOn: SELECTOR },
    { id: PLAIN, label: "Sync", x: 400, y: 100, category: THIRD },
  ],
};
