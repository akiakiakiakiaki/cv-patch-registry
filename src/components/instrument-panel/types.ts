import type { PatchCable, PatchData } from "@/lib/domain/types";
import type { PatchCableColorId } from "@/lib/domain/patch-colors";
import type {
  FocusedLayoutElement,
  InstrumentLayout,
  PatchPort,
  Point,
} from "@/lib/instrument/layout";
import type { InstrumentDefinition } from "@/lib/instruments/types";

export interface InstrumentPanelProps {
  /** Public patches of other users: the panel is inert and every change is ignored. */
  readOnly?: boolean;
  data: PatchData;
  instrument: InstrumentDefinition;
  layout: InstrumentLayout;
  layoutEditMode: boolean;
  focusedElement: FocusedLayoutElement | null;
  onFocusLayoutElement: (target: FocusedLayoutElement) => void;
  onClearLayoutFocus: () => void;
  onMoveFocusedLayoutElement: (delta: Point) => void;
  /** Lets a parent convert pointer positions into panel units (e.g. palette drops). */
  panelRef?: { current: SVGSVGElement | null };
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
  colorId: PatchCableColorId;
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
  colorId: PatchCableColorId;
}
