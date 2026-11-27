import type { CSSProperties } from "react";
import { PlacementPreview, controlExtent, slideThumb, slideTravel } from "@/components/instrument-panel/control-layer/PlacementPreview";
import panel from "@/components/instrument-panel/InstrumentPanel.module.scss";
import type { PaletteItem } from "@/components/synth-editor/palette";
import { switchRect } from "@/lib/instrument/geometry";
import type { InstrumentLayout } from "@/lib/instrument/layout";
import { cx } from "@/lib/utils/class-names";
import styles from "./PaletteGhost.module.scss";

/** On screen, one panel unit is drawn this many pixels wide (the panel itself scales with the window). */
const PIXELS_PER_UNIT = 1.5;
const MARGIN = 4;
const CENTER = { x: 0, y: 0 };

/**
 * What a palette item looks like and does on the panel, as a small looping animation: a knob turns,
 * a switch and an LED go on and off, a slide switch moves its thumb. Ports have no behavior and are shown still.
 * Decorative only; without motion (prefers-reduced-motion) the controls stand still.
 */
export function PaletteGhost({ item, layout }: { item: PaletteItem; layout: InstrumentLayout }) {
  const half = controlExtent(item, layout);
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
      <ControlBehavior item={item} layout={layout} />
    </svg>
  );
}

function ControlBehavior({ item, layout }: { item: PaletteItem; layout: InstrumentLayout }) {
  const { geometry } = layout;

  if (item.kind === "knob") {
    // Starts at the knob's lowest value and turns through its whole sweep.
    const start = (layout.knobStartAngle * Math.PI) / 180;
    const { indicatorLength, indicatorWidth, hitRadius } = geometry.knob;
    return (
      <>
        <circle className={styles.body} r={hitRadius} />
        <g className={styles.turn} data-animation="turn" style={{ "--sweep": `${layout.knobSweepAngle}deg` } as CSSProperties}>
          <line
            className={panel.knobTick}
            x2={Math.cos(start) * indicatorLength}
            y2={Math.sin(start) * indicatorLength}
            strokeWidth={indicatorWidth}
          />
        </g>
      </>
    );
  }

  if (item.kind === "switch") {
    const rect = switchRect(geometry.switch, item.style);
    const frame = { x: -rect.width / 2, y: -rect.height / 2, width: rect.width, height: rect.height, rx: rect.cornerRadius };
    if (item.style === "slide") {
      return (
        <>
          <rect className={panel.slideTrack} {...frame} />
          <g className={styles.slide} data-animation="slide" style={{ "--travel": `${slideTravel(rect)}px` } as CSSProperties}>
            <rect className={cx(panel.slideThumb, panel.toggleBlue, panel.active)} {...slideThumb(CENTER, rect)} />
          </g>
        </>
      );
    }
    return (
      <>
        <rect className={cx(panel.toggleHit, panel.toggleBlue)} {...frame} />
        <rect className={cx(panel.toggleHit, panel.toggleBlue, panel.active, styles.blink)} data-animation="blink" {...frame} />
      </>
    );
  }

  if (item.kind === "led") {
    const radius = geometry.led.hitRadius;
    return (
      <>
        <circle className={cx(panel.ledHit, panel.ledRed)} r={radius} />
        <circle className={cx(panel.ledHit, panel.ledRed, panel.active, panel.ledRedActive, styles.blink)} data-animation="blink" r={radius} />
      </>
    );
  }

  return <PlacementPreview {...item} point={CENTER} layout={layout} />;
}
