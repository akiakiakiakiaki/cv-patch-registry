export interface Point {
  x: number;
  y: number;
}

export interface KnobDefinition extends Point {
  id: string;
}

export interface SwitchDefinition extends Point {
  id: string;
}

export interface LedDefinition extends Point {
  id: string;
  color: 'red' | 'blue' | 'amber';
}

export interface PatchPort extends Point {
  id: string;
  label: string;
  kind: 'in' | 'out';
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
  layoutVersion: number;
  id: string;
  displayName: string;
  viewBox: { width: number; height: number };
  geometry: InstrumentGeometry;
  knobStartAngle: number;
  knobSweepAngle: number;
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
