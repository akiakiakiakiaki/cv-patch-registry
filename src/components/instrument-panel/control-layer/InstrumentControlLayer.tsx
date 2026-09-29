"use client";

import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import type { PatchData } from "@/lib/domain/types";
import type {
  FocusedLayoutElement,
  InstrumentLayout,
  PatchPort,
  Point,
} from "@/lib/instrument/layout";
import type { InstrumentDefinition } from "@/lib/instruments/types";
import { InstrumentHitArea } from "@/components/instrument-hit-area/InstrumentHitArea";
import styles from "../InstrumentPanel.module.scss";
import type { useInstrumentPanelInteractions } from "../useInstrumentPanelInteractions";
import { handleKeyboardToggle } from "../utils";
import { useI18n } from "@/i18n/provider";
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
  interactions: ReturnType<typeof useInstrumentPanelInteractions>;
  onFocusLayoutElement: (target: FocusedLayoutElement) => void;
  onKnobChange: (id: string, value: number) => void;
  onSwitchChange: (id: string, value: boolean) => void;
  onLedChange: (id: string, value: boolean) => void;
}

export function InstrumentControlLayer({
  data,
  instrument,
  layout,
  layoutEditMode,
  focusedElement,
  interactions,
  onFocusLayoutElement,
  onKnobChange,
  onSwitchChange,
  onLedChange,
}: InstrumentControlLayerProps) {
  const { t } = useI18n();

  function focusElement(
    event: MouseEvent<SVGElement>,
    target: FocusedLayoutElement,
  ) {
    onFocusLayoutElement(target);
    event.currentTarget.focus();
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
        return (
          <g key={knob.id}>
            <InstrumentHitArea
              shape={layout.geometry.knob.shape}
              x={knob.x}
              y={knob.y}
              radius={layout.geometry.knob.hitRadius}
              className={`${styles.knobHit}${layoutEditMode && focusedElement?.kind === "knob" && focusedElement.id === knob.id ? ` ${styles.layoutEditFocus}` : ""}`}
              tabIndex={0}
              role={layoutEditMode ? "button" : "slider"}
              ariaLabel={knob.id}
              ariaValueMin={layoutEditMode ? undefined : KNOB_VALUE_MIN}
              ariaValueMax={layoutEditMode ? undefined : KNOB_VALUE_MAX}
              ariaValueNow={layoutEditMode ? undefined : value}
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
              className={styles.knobTick}
              x1={knob.x}
              y1={knob.y}
              x2={
                knob.x +
                Math.cos(angle) * layout.geometry.knob.indicatorLength
              }
              y2={
                knob.y +
                Math.sin(angle) * layout.geometry.knob.indicatorLength
              }
              strokeWidth={layout.geometry.knob.indicatorWidth}
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
          const update = instrument.switchAdapter.toggle(
            data.switches,
            control.id,
          );
          onSwitchChange(update.id, update.value);
        };
        return (
          <InstrumentHitArea
            key={control.id}
            shape={layout.geometry.switch.shape}
            x={control.x}
            y={control.y}
            width={layout.geometry.switch.width}
            height={layout.geometry.switch.height}
            cornerRadius={layout.geometry.switch.cornerRadius}
            className={`${styles.toggleHit} ${state.color === "red" ? styles.toggleRed : styles.toggleBlue}${state.active && !layoutEditMode ? ` ${styles.active}` : ""}${layoutEditMode && focusedElement?.kind === "switch" && focusedElement.id === control.id ? ` ${styles.layoutEditFocus}` : ""}`}
            tabIndex={0}
            role="button"
            ariaLabel={control.id}
            ariaPressed={!layoutEditMode && state.active}
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
      })}

      {layout.leds.map((led) => {
        const active = data.leds[led.id] ?? false;
        const toggle = () => onLedChange(led.id, !active);
        return (
          <InstrumentHitArea
            key={led.id}
            shape={layout.geometry.led.shape}
            x={led.x}
            y={led.y}
            radius={layout.geometry.led.hitRadius}
            tabIndex={0}
            role="checkbox"
            className={[
              styles.ledHit,
              led.color === "red" ? styles.ledRed : styles.ledBlue,
              active && !layoutEditMode ? styles.active : "",
              active && !layoutEditMode && led.color === "red"
                ? styles.ledRedActive
                : "",
              active && !layoutEditMode && led.color === "blue"
                ? styles.ledBlueActive
                : "",
              layoutEditMode &&
              focusedElement?.kind === "led" &&
              focusedElement.id === led.id
                ? styles.layoutEditFocus
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            ariaLabel={led.id}
            ariaChecked={!layoutEditMode && active}
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
          className={`${styles.portHit}${layoutEditMode && focusedElement?.kind === "port" && focusedElement.id === port.id ? ` ${styles.layoutEditFocus}` : ""}`}
          tabIndex={0}
          role="button"
          ariaLabel={t(
            port.kind === "out" ? "instrument.output" : "instrument.input",
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
    </>
  );
}
