import { genericSwitchAdapter } from "@/lib/instruments/generic-switch-adapter";
import type { InstrumentLayout } from "@/lib/instrument/layout";
import type { InstrumentDefinition } from "@/lib/instruments/types";

/** Adapts a user-built synth (from the catalog) to the panel's instrument shape. Pure mapping, no I/O. */
export function instrumentFromSynth(synth: { slug: string; displayName: string; panelUrl: string; layout: InstrumentLayout }): InstrumentDefinition {
  return {
    id: synth.slug,
    displayName: synth.displayName,
    imageSrc: synth.panelUrl,
    layoutFile: "",
    layout: synth.layout,
    switchAdapter: genericSwitchAdapter,
  };
}
