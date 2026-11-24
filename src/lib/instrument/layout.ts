import type { PortKind } from "@/lib/domain/port-rules";

export interface Point {
  x: number;
  y: number;
}

/**
 * A named color of a synth. Controls refer to a category instead of carrying their own color,
 * so changing the category's color recolors all of its controls.
 */
export interface ControlCategory {
  id: string;
  name: string;
  /** Lowercase `#rrggbb`. */
  color: string;
}

/** Labels are editable and optional. Without a label the control ID is shown. */
export interface KnobDefinition extends Point {
  id: string;
  label?: string;
  /** Color category; without one the default knob color is used. */
  category?: string;
}

/**
 * A switch is one of three things:
 * - plain: one on/off state, colored by its optional `category` (default blue);
 * - selector: `selects` lists at least two categories in cycling order; a click activates the next one;
 * - dependent: `dependsOn` names a selector; the switch keeps one state per category of that selector
 *   and shows the state and color of the selector's active category.
 * A selector cannot depend on another switch, and a dependent cannot be a selector.
 */
export interface SwitchDefinition extends Point {
  id: string;
  label?: string;
  category?: string;
  selects?: readonly string[];
  dependsOn?: string;
}

export interface LedDefinition extends Point {
  id: string;
  label?: string;
  /** Fixed color, used when the LED has no category. */
  color: 'red' | 'blue' | 'amber';
  /** Color category; takes precedence over `color`. */
  category?: string;
}

export interface PatchPort extends Point {
  id: string;
  label: string;
  kind: PortKind;
}

export interface InstrumentGeometry {
  knob: { shape: 'circle'; hitRadius: number; indicatorLength: number; indicatorWidth: number };
  switch: { shape: 'rect'; width: number; height: number; cornerRadius: number };
  led: { shape: 'circle'; hitRadius: number };
  port: { shape: 'circle'; hitRadius: number; connectionRadius: number; endpointRadius: number };
  cable: { lineWidth: number; hitAreaWidth: number };
}

export interface InstrumentLayout {
  schemaVersion: number;
  /** Missing means 0. Written only when the layout uses a feature of a newer minor (e.g. uni ports). */
  schemaMinor?: number;
  layoutVersion: number;
  id: string;
  displayName: string;
  viewBox: { width: number; height: number };
  geometry: InstrumentGeometry;
  knobStartAngle: number;
  knobSweepAngle: number;
  /** Optional color categories, in display order. */
  categories?: readonly ControlCategory[];
  knobs: readonly KnobDefinition[];
  switches: readonly SwitchDefinition[];
  leds: readonly LedDefinition[];
  ports: readonly PatchPort[];
}

export type LayoutElementKind = 'knob' | 'switch' | 'led' | 'port';

export interface FocusedLayoutElement {
  kind: LayoutElementKind;
  id: string;
}
