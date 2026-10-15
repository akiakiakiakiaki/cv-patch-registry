import { generateControlId, nextAutoLabel, type ControlKind } from "@/lib/domain/control-ids";
import type { DraftControl } from "@/lib/adapters/synth-layout-adapter";
import type { InstrumentLayout } from "@/lib/instrument/layout";
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

/** Adds a control with a generated ID and the next free automatic label of its kind. */
export function addControl(
  controls: readonly EditorControl[],
  kind: ControlKind,
  position: { x: number; y: number },
  bounds: PanelBounds,
): EditorControl[] {
  const point = clampToPanel(position, bounds);
  const control: EditorControl = {
    id: generateControlId(kind),
    kind,
    label: nextAutoLabel(kind, controls.map((item) => item.label)),
    ...point,
    ...(kind === "led" ? { color: "red" as const } : {}),
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

/** Editor state from a stored layout. Labels fall back to the ID for legacy controls. */
export function controlsFromLayout(layout: InstrumentLayout): EditorControl[] {
  const fromPoints = (kind: ControlKind, points: readonly { id: string; label?: string; x: number; y: number }[]) =>
    points.map((point) => ({ id: point.id, kind, label: point.label ?? point.id, x: point.x, y: point.y }));
  return [
    ...fromPoints("knob", layout.knobs),
    ...fromPoints("switch", layout.switches),
    ...layout.leds.map((led) => ({ id: led.id, kind: "led" as const, label: led.label ?? led.id, x: led.x, y: led.y, color: led.color })),
    ...layout.ports.map((port) => ({ id: port.id, kind: port.kind, label: port.label, x: port.x, y: port.y })),
  ];
}
