import type { PatchCable, PatchData } from "@/lib/domain/types";
import type {
  FocusedLayoutElement,
  InstrumentLayout,
  PatchPort,
  Point,
} from "@/lib/instrument/layout";
import type { InstrumentDefinition } from "@/lib/instruments/types";

export interface InstrumentPanelProps {
  data: PatchData;
  instrument: InstrumentDefinition;
  layout: InstrumentLayout;
  layoutEditMode: boolean;
  focusedElement: FocusedLayoutElement | null;
  onFocusLayoutElement: (target: FocusedLayoutElement) => void;
  onClearLayoutFocus: () => void;
  onMoveFocusedLayoutElement: (delta: Point) => void;
  onKnobChange: (id: string, value: number) => void;
  onSwitchChange: (id: string, value: boolean) => void;
  onLedChange: (id: string, value: boolean) => void;
  onCableChange: (cables: PatchCable[]) => void;
}

export interface CableColorPicker {
  from: string;
  to: string;
  x: number;
  y: number;
}

export interface CableGesture {
  fixedPort: PatchPort;
  originalIndex: number | null;
  color: string;
  startPoint: Point;
  clickedEndpoint: PatchPort | null;
  moved: boolean;
}

export interface EndpointClick {
  cableKey: string;
  portId: string;
  time: number;
}

export interface CablePreview {
  path: string;
  color: string;
}
