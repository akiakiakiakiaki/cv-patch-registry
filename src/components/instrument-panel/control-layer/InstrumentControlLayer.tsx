"use client";

import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import type { PatchData } from "@/lib/domain/types";
import type {
  FocusedLayoutElement,
  InstrumentLayout,
  PatchPort,
} from "@/lib/instrument/layout";
import type { InstrumentDefinition } from "@/lib/instruments/types";
import { InstrumentHitArea } from "@/components/instrument-hit-area/InstrumentHitArea";
import { categoryClass } from "@/components/instrument-panel/category-styles";
import styles from "../InstrumentPanel.module.scss";
import type { useInstrumentPanelInteractions } from "../useInstrumentPanelInteractions";
import { handleKeyboardToggle } from "../utils";
import { useI18n } from "@/i18n/provider";
import { cx } from "@/lib/utils/class-names";
import { categoryScale, roundFactor, scaleRect, switchRect } from "@/lib/instrument/geometry";
import type { InstrumentSwitchState } from "@/lib/instruments/types";
import { PlacementPreview, slideThumb, slideTravel, type ControlPreview } from "./PlacementPreview";
import {
  DEFAULT_KNOB_VALUE,
  KNOB_VALUE_MAX,
  KNOB_VALUE_MIN,
} from "@/lib/domain/knob-range";

interface InstrumentControlLayerProps {
  data: PatchData;
  instrument: InstrumentDefinition;
  layout: InstrumentLayout;
  layoutEditMode: boolean;
  focusedElement: FocusedLayoutElement | null;
  placementPreview?: ControlPreview | null;
  interactions: ReturnType<typeof useInstrumentPanelInteractions>;
  onFocusLayoutElement: (target: FocusedLayoutElement) => void;
  onBeginLayoutDrag: (target: FocusedLayoutElement, event: PointerEvent<SVGElement>) => void;
  onKnobChange: (id: string, value: number) => void;
  /** All switch states one click changes. */
  onSwitchChange: (updates: Readonly<Record<string, boolean>>) => void;
  onLedChange: (id: string, value: boolean) => void;
}

export function InstrumentControlLayer({
  data,
  instrument,
  layout,
  layoutEditMode,
  focusedElement,
  placementPreview,
  interactions,
  onFocusLayoutElement,
  onBeginLayoutDrag,
  onKnobChange,
  onSwitchChange,
  onLedChange,
}: InstrumentControlLayerProps) {
  const { t } = useI18n();
  /** The element focused for layout editing gets the focus ring. */
  const focusClass = (kind: FocusedLayoutElement["kind"], id: string) =>
    layoutEditMode && focusedElement?.kind === kind && focusedElement.id === id ? styles.layoutEditFocus : null;

  function focusElement(
    event: MouseEvent<SVGElement>,
    target: FocusedLayoutElement,
  ) {
    onFocusLayoutElement(target);
    event.currentTarget.focus();
    // A pointer press on a layout element starts a drag; the panel tracks the pointer from here.
    if ("pointerId" in event) onBeginLayoutDrag(target, event as PointerEvent<SVGElement>);
  }

  function updateKnobFromKey(
    event: KeyboardEvent<SVGElement>,
    id: string,
    value: number,
  ) {
    if (layoutEditMode) return;
    if (
      event.key !== "ArrowUp" &&
      event.key !== "ArrowRight" &&
      event.key !== "ArrowDown" &&
      event.key !== "ArrowLeft"
    )
      return;
    event.preventDefault();
    const direction =
      event.key === "ArrowUp" || event.key === "ArrowRight" ? 1 : -1;
    onKnobChange(
      id,
      Math.max(KNOB_VALUE_MIN, Math.min(KNOB_VALUE_MAX, value + direction)),
    );
  }

  function beginKnob(
    event: PointerEvent<SVGElement>,
    id: string,
    value: number,
  ) {
    if (layoutEditMode) {
      focusElement(event, { kind: "knob", id });
      return;
    }
    interactions.beginKnobGesture(event, id, value);
  }

  return (
    <>
      {layout.knobs.map((knob) => {
        const value = data.knobs[knob.id] ?? DEFAULT_KNOB_VALUE;
        const angle =
          ((layout.knobStartAngle +
            (value * layout.knobSweepAngle) / KNOB_VALUE_MAX) *
            Math.PI) /
          180;
        // A category may scale its knobs; they stay round.
        const size = roundScale(layout, knob.category);
        const indicatorLength = layout.geometry.knob.indicatorLength * size;
        return (
          <g key={knob.id}>
            <InstrumentHitArea
              shape={layout.geometry.knob.shape}
              x={knob.x}
              y={knob.y}
              radius={layout.geometry.knob.hitRadius * size}
              className={cx(styles.knobHit, focusClass("knob", knob.id))}
              tabIndex={0}
              role={layoutEditMode ? "button" : "slider"}
              ariaLabel={knob.id}
              ariaValueMin={layoutEditMode ? undefined : KNOB_VALUE_MIN}
              ariaValueMax={layoutEditMode ? undefined : KNOB_VALUE_MAX}
              ariaValueNow={layoutEditMode ? undefined : value}
              layoutElement={{ kind: "knob", id: knob.id }}
              onPointerDown={(event) => beginKnob(event, knob.id, value)}
              onPointerMove={interactions.updateKnobGesture}
              onPointerUp={() =>
                interactions.finishKnobGesture(knob.id)
              }
              onClick={(event) => {
                if (layoutEditMode) {
                  focusElement(event, { kind: "knob", id: knob.id });
                  return;
                }
                if (interactions.consumeSuppressedClick(knob.id)) return;
                onKnobChange(
                  knob.id,
                  value >= KNOB_VALUE_MAX
                    ? KNOB_VALUE_MIN
                    : Math.min(KNOB_VALUE_MAX, value + 5),
                );
              }}
              onKeyDown={(event) => updateKnobFromKey(event, knob.id, value)}
            />
            <line
              className={cx(styles.knobTick, categoryClass(knob.category))}
              x1={knob.x}
              y1={knob.y}
              x2={knob.x + Math.cos(angle) * indicatorLength}
              y2={knob.y + Math.sin(angle) * indicatorLength}
              strokeWidth={layout.geometry.knob.indicatorWidth * size}
            />
          </g>
        );
      })}

      {layout.switches.map((control) => {
        const state = instrument.switchAdapter.getState(
          data.switches,
          control.id,
        );
        const toggle = () => {
          onSwitchChange(instrument.switchAdapter.toggle(data.switches, control.id));
        };
        // Only a switch the category is assigned to directly is scaled; selectors and dependents keep the default size.
        const rect = scaleRect(switchRect(layout.geometry.switch, control.style), categoryScale(layout.categories, control.category));
        const slide = control.style === "slide";
        const on = state.active && !layoutEditMode;
        const { fill: colorClass, frame: trackColorClass } = switchColorClasses(state);
        const hitArea = (
          <InstrumentHitArea
            key={control.id}
            shape={layout.geometry.switch.shape}
            x={control.x}
            y={control.y}
            width={rect.width}
            height={rect.height}
            cornerRadius={rect.cornerRadius}
            className={cx(
              // A push button is colored as a whole; a slide switch colors its thumb and frame.
              slide ? cx(styles.slideTrack, trackColorClass) : cx(styles.toggleHit, colorClass, on && styles.active),
              focusClass("switch", control.id),
            )}
            tabIndex={0}
            role={slide ? "switch" : "button"}
            ariaLabel={control.id}
            ariaPressed={slide ? undefined : on}
            ariaChecked={slide ? on : undefined}
            layoutElement={{ kind: "switch", id: control.id }}
            onPointerDown={(event) => {
              if (layoutEditMode) focusElement(event, { kind: "switch", id: control.id });
            }}
            onClick={(event) => {
              if (layoutEditMode) {
                focusElement(event, { kind: "switch", id: control.id });
                return;
              }
              toggle();
            }}
            onKeyDown={(event) => {
              if (!layoutEditMode) handleKeyboardToggle(event, toggle);
            }}
          />
        );
        if (!slide) return hitArea;
        return (
          <g key={control.id}>
            {hitArea}
            <rect
              aria-hidden="true"
              pointerEvents="none"
              // Always filled in the switch's color; only its position tells off from on.
              className={cx(styles.slideThumb, colorClass, styles.active)}
              {...slideThumb(control, rect)}
              // Glides to the right when on, with the same motion as the palette preview.
              style={{ transform: `translateX(${on ? slideTravel(rect) : 0}px)` }}
            />
          </g>
        );
      })}

      {layout.leds.map((led) => {
        const active = data.leds[led.id] ?? false;
        const toggle = () => onLedChange(led.id, !active);
        const ledCategory = categoryClass(led.category);
        const lit = active && !layoutEditMode;
        return (
          <InstrumentHitArea
            key={led.id}
            shape={layout.geometry.led.shape}
            x={led.x}
            y={led.y}
            radius={layout.geometry.led.hitRadius * roundScale(layout, led.category)}
            tabIndex={0}
            role="checkbox"
            layoutElement={{ kind: "led", id: led.id }}
            className={cx(
              styles.ledHit,
              // A category's color takes precedence over the LED's fixed color.
              ledCategory ? cx(styles.ledCategory, ledCategory) : led.color === "red" ? styles.ledRed : styles.ledBlue,
              lit && styles.active,
              lit && ledCategory && styles.ledCategoryActive,
              lit && !ledCategory && led.color === "red" && styles.ledRedActive,
              lit && !ledCategory && led.color === "blue" && styles.ledBlueActive,
              focusClass("led", led.id),
            )}
            ariaLabel={led.id}
            ariaChecked={!layoutEditMode && active}
            onPointerDown={(event) => {
              if (layoutEditMode) focusElement(event, { kind: "led", id: led.id });
            }}
            onClick={(event) => {
              if (layoutEditMode) {
                focusElement(event, { kind: "led", id: led.id });
                return;
              }
              toggle();
            }}
            onKeyDown={(event) => {
              if (!layoutEditMode) handleKeyboardToggle(event, toggle);
            }}
          />
        );
      })}

      {layout.ports.map((port: PatchPort) => (
        <InstrumentHitArea
          key={port.id}
          shape={layout.geometry.port.shape}
          x={port.x}
          y={port.y}
          radius={layout.geometry.port.hitRadius}
          className={cx(styles.portHit, focusClass("port", port.id))}
          tabIndex={0}
          role="button"
          layoutElement={{ kind: "port", id: port.id }}
          ariaLabel={t(
            port.kind === "out" ? "instrument.output" : port.kind === "uni" ? "instrument.uni" : "instrument.input",
            { label: port.label },
          )}
          onPointerDown={(event) => {
            if (layoutEditMode) {
              focusElement(event, { kind: "port", id: port.id });
              return;
            }
            interactions.beginFromPort(event, port);
          }}
          onClick={(event) => {
            if (layoutEditMode) focusElement(event, { kind: "port", id: port.id });
          }}
        />
      ))}
      {placementPreview ? (
        <PlacementPreview layout={layout} {...placementPreview} />
      ) : null}
    </>
  );
}

/**
 * Color classes of a switch from one decision: its category, else its fixed red or blue. `fill` colors a push
 * button or a slide switch's thumb; `frame` the slide switch's track border (blue keeps the neutral frame).
 */
function switchColorClasses(state: InstrumentSwitchState): { fill: string | undefined; frame: string | undefined } {
  if (state.categoryId) {
    const category = categoryClass(state.categoryId);
    return { fill: cx(styles.toggleCategory, category), frame: cx(styles.slideTrackCategory, category) };
  }
  return state.color === "red" ? { fill: styles.toggleRed, frame: styles.slideTrackRed } : { fill: styles.toggleBlue, frame: undefined };
}

/** Size factor of a round control (knob, LED) from its category; round controls use the smaller factor. */
function roundScale(layout: InstrumentLayout, categoryId: string | undefined): number {
  return roundFactor(categoryScale(layout.categories, categoryId));
}

