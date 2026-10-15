export type ControlKind = "knob" | "switch" | "led" | "in" | "out" | "uni";

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
