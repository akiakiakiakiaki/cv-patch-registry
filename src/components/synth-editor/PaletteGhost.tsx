import { PlacementPreview } from "@/components/instrument-panel/control-layer/PlacementPreview";
import type { PaletteItem } from "@/components/synth-editor/palette";
import { switchRect } from "@/lib/instrument/geometry";
import type { InstrumentLayout } from "@/lib/instrument/layout";

/** On screen, one panel unit is drawn this many pixels wide (the panel itself scales with the window). */
const PIXELS_PER_UNIT = 1.5;
const MARGIN = 4;

/** Half width and half height a control needs around its center. */
function extent({ kind, style }: PaletteItem, layout: InstrumentLayout): { x: number; y: number } {
  const { geometry } = layout;
  if (kind === "knob") {
    const reach = Math.max(geometry.knob.hitRadius, geometry.knob.indicatorLength);
    return { x: reach, y: reach };
  }
  if (kind === "switch") {
    const rect = switchRect(geometry.switch, style);
    return { x: rect.width / 2, y: rect.height / 2 };
  }
  const radius = kind === "led" ? geometry.led.hitRadius : geometry.port.hitRadius;
  return { x: radius, y: radius };
}

/** What a palette item will look like on the panel, drawn like the drag preview. Decorative only. */
export function PaletteGhost({ item, layout }: { item: PaletteItem; layout: InstrumentLayout }) {
  const half = extent(item, layout);
  const width = (half.x + MARGIN) * 2;
  const height = (half.y + MARGIN) * 2;
  return (
    <svg
      aria-hidden="true"
      data-testid={`palette-ghost-${item.style ?? item.kind}`}
      viewBox={`${-width / 2} ${-height / 2} ${width} ${height}`}
      width={width * PIXELS_PER_UNIT}
      height={height * PIXELS_PER_UNIT}
      style={{ display: "block", overflow: "visible" }}
    >
      <PlacementPreview {...item} point={{ x: 0, y: 0 }} layout={layout} />
    </svg>
  );
}
