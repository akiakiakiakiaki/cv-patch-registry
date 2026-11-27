import type { LayoutElementKind } from "@/lib/instrument/layout";

/** Every kind of control a synth layout can hold, in the order the editor lists them. */
export const CONTROL_KINDS = ["knob", "switch", "led", "in", "out", "uni"] as const;
export type ControlKind = (typeof CONTROL_KINDS)[number];

const AUTO_LABEL_NAMES: Readonly<Record<ControlKind, string>> = {
  knob: "Knob",
  switch: "Switch",
  led: "LED",
  in: "In",
  out: "Out",
  uni: "Uni",
};

/** Stable, opaque control ID. Independent of the label, so renaming never changes it. */
export function generateControlId(kind: ControlKind): string {
  return `${kind}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Next free automatic label for a kind, e.g. "Knob 3" after "Knob 1" and "Knob 2". */
export function nextAutoLabel(kind: ControlKind, existingLabels: readonly string[]): string {
  const prefix = `${AUTO_LABEL_NAMES[kind]} `;
  const used = new Set(existingLabels);
  let number = 1;
  while (used.has(`${prefix}${number}`)) number += 1;
  return `${prefix}${number}`;
}

/** The panel element a control is drawn as: knobs, switches and LEDs keep their kind, all ports are "port". */
export function layoutElementKindOf(kind: ControlKind): LayoutElementKind {
  return kind === "knob" || kind === "switch" || kind === "led" ? kind : "port";
}

