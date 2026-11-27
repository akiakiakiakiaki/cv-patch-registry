import { generateControlId, nextAutoLabel, type ControlKind } from "@/lib/domain/control-ids";
import { draftControlsFromLayout, type DraftControl } from "@/lib/adapters/synth-layout-adapter";
import type { SwitchStyle } from "@/lib/instrument/layout";
import { normalizePixelPosition } from "@/lib/instrument/pixel-position";

export type EditorControl = DraftControl;
export type EditableField = Partial<Pick<EditorControl, "label" | "x" | "y" | "color">>;
export interface PanelBounds {
  width: number;
  height: number;
}

/** Positions are kept on the half-unit grid and inside the panel, like the keyboard steps. */
export function clampToPanel(position: { x: number; y: number }, bounds: PanelBounds): { x: number; y: number } {
  return {
    x: normalizePixelPosition(position.x, bounds.width),
    y: normalizePixelPosition(position.y, bounds.height),
  };
}

/** Adds a control with a generated ID and the next free automatic label of its kind; `style` only for switches. */
export function addControl(
  controls: readonly EditorControl[],
  kind: ControlKind,
  position: { x: number; y: number },
  bounds: PanelBounds,
  id = generateControlId(kind),
  style?: SwitchStyle,
): EditorControl[] {
  const point = clampToPanel(position, bounds);
  const control: EditorControl = {
    id,
    kind,
    label: nextAutoLabel(kind, controls.map((item) => item.label)),
    ...point,
    ...(kind === "led" ? { color: "red" as const } : {}),
    ...(kind === "switch" && style ? { style } : {}),
  };
  return [...controls, control];
}

/** Renaming and moving never change the control ID. */
export function updateControl(
  controls: readonly EditorControl[],
  id: string,
  change: EditableField,
  bounds: PanelBounds,
): EditorControl[] {
  return controls.map((control) => {
    if (control.id !== id) return control;
    const next = { ...control, ...change };
    return { ...next, ...clampToPanel(next, bounds) };
  });
}

export function removeControl(controls: readonly EditorControl[], id: string): EditorControl[] {
  return controls.filter((control) => control.id !== id);
}

/** Editor state from a stored layout (see draftControlsFromLayout). */
export const controlsFromLayout = draftControlsFromLayout;
