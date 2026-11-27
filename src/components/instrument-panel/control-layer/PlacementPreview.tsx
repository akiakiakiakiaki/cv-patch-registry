import type { ControlKind } from "@/lib/domain/control-ids";
import { DEFAULT_KNOB_VALUE, KNOB_VALUE_MAX } from "@/lib/domain/knob-range";
import { switchRect } from "@/lib/instrument/geometry";
import type { InstrumentLayout, Point, SwitchStyle } from "@/lib/instrument/layout";
import { cx } from "@/lib/utils/class-names";
import styles from "../InstrumentPanel.module.scss";

/** A control that is about to be placed: shown while dragging from the palette and in the palette's hover preview. */
export interface ControlPreview {
  kind: ControlKind;
  style?: SwitchStyle;
  point: Point;
}

/** Inner gap between a slide switch's track and its thumb, in panel units. */
const SLIDE_INSET = 3;

/** The thumb of a slide switch: the left half when off, the right half when on. */
export function slideThumb(point: Point, track: { width: number; height: number; cornerRadius: number }, on: boolean) {
  const width = track.width / 2 - SLIDE_INSET * 2;
  const height = track.height - SLIDE_INSET * 2;
  const left = point.x - track.width / 2 + SLIDE_INSET + (on ? track.width / 2 : 0);
  return { x: left, y: point.y - height / 2, width, height, rx: Math.max(0, track.cornerRadius - SLIDE_INSET) };
}

/** Semi-transparent outline of a control, drawn like the placed control but without interaction. */
export function PlacementPreview({ kind, style, point, layout }: ControlPreview & { layout: InstrumentLayout }) {
  const ghostClass = styles.layoutEditFocus;

  if (kind === "knob") {
    const angle = ((layout.knobStartAngle + (DEFAULT_KNOB_VALUE * layout.knobSweepAngle) / KNOB_VALUE_MAX) * Math.PI) / 180;
    const { indicatorLength } = layout.geometry.knob;
    return (
      <g aria-hidden="true" opacity={0.7} pointerEvents="none">
        <circle className={cx(styles.knobHit, ghostClass)} cx={point.x} cy={point.y} r={layout.geometry.knob.hitRadius} />
        <line
          className={styles.knobTick}
          x1={point.x}
          y1={point.y}
          x2={point.x + Math.cos(angle) * indicatorLength}
          y2={point.y + Math.sin(angle) * indicatorLength}
          strokeWidth={layout.geometry.knob.indicatorWidth}
        />
      </g>
    );
  }

  if (kind === "switch") {
    const rect = switchRect(layout.geometry.switch, style);
    const track = (
      <rect
        className={cx(style === "slide" ? styles.slideTrack : styles.toggleHit, styles.toggleBlue, ghostClass)}
        x={point.x - rect.width / 2}
        y={point.y - rect.height / 2}
        width={rect.width}
        height={rect.height}
        rx={rect.cornerRadius}
      />
    );
    return (
      <g aria-hidden="true" opacity={0.7} pointerEvents="none">
        {track}
        {style === "slide" ? <rect className={cx(styles.slideThumb, styles.toggleBlue, styles.active)} {...slideThumb(point, rect, false)} /> : null}
      </g>
    );
  }

  if (kind === "led") {
    return (
      <circle
        aria-hidden="true"
        pointerEvents="none"
        opacity={0.7}
        className={cx(styles.ledHit, styles.ledRed, ghostClass)}
        cx={point.x}
        cy={point.y}
        r={layout.geometry.led.hitRadius}
      />
    );
  }

  return (
    <circle
      aria-hidden="true"
      pointerEvents="none"
      opacity={0.7}
      className={cx(styles.portHit, ghostClass)}
      cx={point.x}
      cy={point.y}
      r={layout.geometry.port.hitRadius}
    />
  );
}
