import { normalizeSubmittedData } from "@/lib/adapters/patch-document-adapter";
import type { InstrumentLayout } from "@/lib/instrument/layout";

type LayoutControls = Pick<InstrumentLayout, "knobs" | "switches" | "leds" | "ports">;

/** A setting of a patch that the newer synth revision has no control for. Labels come from the older revision. */
export type RevisionLoss =
  | { kind: "knob"; id: string; label: string; value: number }
  | { kind: "switch" | "led"; id: string; label: string; value: boolean }
  | { kind: "cable"; id: string; label: string };

/**
 * What a move from `from` to `to` would drop: values of controls and cables between ports that `to` no longer has.
 * Values for controls that are new in `to` are ignored here; they are kept by the save itself.
 */
export function findRevisionLosses(data: unknown, from: LayoutControls, to: LayoutControls): RevisionLoss[] {
  const previous = normalizeSubmittedData(data, from);
  const labelOf = (items: readonly { id: string; label?: string }[], id: string) => items.find((item) => item.id === id)?.label || id;
  const has = (items: readonly { id: string }[], id: string) => items.some((item) => item.id === id);

  const losses: RevisionLoss[] = [];
  for (const [id, value] of Object.entries(previous.knobs)) {
    if (!has(to.knobs, id)) losses.push({ kind: "knob", id, label: labelOf(from.knobs, id), value });
  }
  for (const [id, value] of Object.entries(previous.switches)) {
    if (!has(to.switches, id)) losses.push({ kind: "switch", id, label: labelOf(from.switches, id), value });
  }
  for (const [id, value] of Object.entries(previous.leds)) {
    if (!has(to.leds, id)) losses.push({ kind: "led", id, label: labelOf(from.leds, id), value });
  }
  for (const cable of previous.cables) {
    if (has(to.ports, cable.from) && has(to.ports, cable.to)) continue;
    losses.push({ kind: "cable", id: `${cable.from}:${cable.to}`, label: `${labelOf(from.ports, cable.from)} → ${labelOf(from.ports, cable.to)}` });
  }
  return losses;
}
