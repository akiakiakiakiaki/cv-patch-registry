"use client";

import { useEffect, useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { InstrumentArtwork } from "@/components/instrument-artwork/InstrumentArtwork";
import { useI18n } from "@/i18n/provider";
import type { FocusedLayoutElement, Point } from "@/lib/instrument/layout";
import { layoutElementPosition } from "@/lib/instrument/layout-editor";
import { normalizePixelPosition } from "@/lib/instrument/pixel-position";
import { InstrumentControlLayer } from "./control-layer/InstrumentControlLayer";
import { PatchCableLayer } from "./patch-cable-layer/PatchCableLayer";
import { CableColorPicker } from "./patch-cable-layer/color-picker/CableColorPicker";
import styles from "./InstrumentPanel.module.scss";
import type { InstrumentPanelProps } from "./types";
import { useInstrumentPanelInteractions } from "./useInstrumentPanelInteractions";
import { eventPoint } from "./utils";

interface LayoutDrag {
  target: FocusedLayoutElement;
  grab: Point;
}

const NOOP = () => {};

export function InstrumentPanel({
  readOnly = false,
  data,
  instrument,
  layout,
  layoutEditMode,
  focusedElement,
  onFocusLayoutElement,
  onClearLayoutFocus,
  onMoveFocusedLayoutElement,
  focusRequestedElement,
  onFocusRequestHandled,
  onDeleteFocusedLayoutElement,
  panelRef,
  placementPreview,
  onKnobChange,
  onSwitchChange,
  onLedChange,
  onCableChange,
}: InstrumentPanelProps) {
  const { t } = useI18n();
  const layoutDrag = useRef<LayoutDrag | null>(null);
  // Read-only panels ignore every change, even if a gesture slips through the inert attribute.
  const guard = <Args extends unknown[]>(handler: (...args: Args) => void) =>
    readOnly ? NOOP : (...args: Args) => handler(...args);
  const changeKnob = guard(onKnobChange);
  const changeCables = guard(onCableChange);
  const changeSwitch = guard(onSwitchChange);
  const changeLed = guard(onLedChange);
  const interactions = useInstrumentPanelInteractions({
    data,
    layout,
    layoutEditMode,
    onKnobChange: changeKnob,
    onCableChange: changeCables,
  });
  useEffect(() => {
    if (panelRef) panelRef.current = interactions.svgRef.current;
  });
  useEffect(() => {
    if (!focusRequestedElement) return;
    const target = Array.from(
      interactions.svgRef.current?.querySelectorAll<SVGElement>(
        "[data-layout-element-kind][data-layout-element-id]",
      ) ?? [],
    ).find(
      (element) =>
        element.dataset.layoutElementKind === focusRequestedElement.kind &&
        element.dataset.layoutElementId === focusRequestedElement.id,
    );
    target?.focus();
    onFocusRequestHandled?.();
  }, [focusRequestedElement, onFocusRequestHandled, interactions.svgRef]);

  function beginLayoutDrag(target: FocusedLayoutElement, event: PointerEvent<SVGElement>) {
    const svg = interactions.svgRef.current;
    const position = layoutElementPosition(layout, target);
    if (!layoutEditMode || !svg || !position) return;
    const point = eventPoint(svg, event);
    layoutDrag.current = { target, grab: { x: point.x - position.x, y: point.y - position.y } };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  /** Moves the dragged element to the pointer, snapped to half panel units like the keyboard steps. */
  function continueLayoutDrag(event: PointerEvent<SVGSVGElement>) {
    const drag = layoutDrag.current;
    const svg = interactions.svgRef.current;
    const position = drag ? layoutElementPosition(layout, drag.target) : undefined;
    if (!drag || !svg || !position) return;
    const point = eventPoint(svg, event);
    const x = normalizePixelPosition(point.x - drag.grab.x, layout.viewBox.width);
    const y = normalizePixelPosition(point.y - drag.grab.y, layout.viewBox.height);
    const delta = { x: x - position.x, y: y - position.y };
    if (delta.x !== 0 || delta.y !== 0) onMoveFocusedLayoutElement(delta);
  }

  function endLayoutDrag() {
    layoutDrag.current = null;
  }

  function handleKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (!layoutEditMode) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      const target = event.target as SVGElement;
      const kind = target.dataset.layoutElementKind;
      const id = target.dataset.layoutElementId;
      if (
        id &&
        (kind === "knob" || kind === "switch" || kind === "led" || kind === "port") &&
        focusedElement?.kind === kind &&
        focusedElement.id === id
      ) {
        event.preventDefault();
        onDeleteFocusedLayoutElement?.({ kind, id });
      }
      return;
    }
    const deltas: Record<string, Point> = {
      ArrowUp: { x: 0, y: -0.5 },
      ArrowDown: { x: 0, y: 0.5 },
      ArrowLeft: { x: -0.5, y: 0 },
      ArrowRight: { x: 0.5, y: 0 },
    };
    if (event.key === "Escape") {
      onClearLayoutFocus();
      return;
    }
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    onMoveFocusedLayoutElement(delta);
  }

  return (
    <section
      inert={readOnly}
      className={styles.boardWrap}
      aria-label={t("instrument.aria", { name: instrument.displayName })}
    >
      <div className={styles.board}>
        <InstrumentArtwork
          className={styles.boardImage}
          src={instrument.imageSrc}
          label={t("instrument.imageAlt", { name: instrument.displayName })}
          aspectRatio={`${layout.viewBox.width} / ${layout.viewBox.height}`}
        />
        <svg
          ref={interactions.svgRef}
          className={styles.boardOverlay}
          viewBox={`0 0 ${layout.viewBox.width} ${layout.viewBox.height}`}
          preserveAspectRatio="none"
          aria-label={t("instrument.controlsAria")}
          onKeyDown={handleKeyDown}
          onPointerMove={(event) => {
            continueLayoutDrag(event);
            interactions.handleSvgPointerMove(event);
          }}
          onPointerUp={(event) => {
            endLayoutDrag();
            interactions.finishCableDrag(event);
          }}
          onPointerCancel={(event) => {
            endLayoutDrag();
            interactions.finishCableDrag(event);
          }}
        >
          <PatchCableLayer
            data={data}
            layout={layout}
            interactions={interactions}
          />
          <InstrumentControlLayer
            data={data}
            instrument={instrument}
            layout={layout}
            layoutEditMode={layoutEditMode}
            focusedElement={focusedElement}
            placementPreview={placementPreview}
            interactions={interactions}
            onFocusLayoutElement={onFocusLayoutElement}
            onBeginLayoutDrag={beginLayoutDrag}
            onKnobChange={changeKnob}
            onSwitchChange={changeSwitch}
            onLedChange={changeLed}
          />
          <CableColorPicker
            data={data}
            picker={interactions.colorPicker}
            pickerRef={interactions.colorPickerRef}
            onSelect={interactions.selectCableColor}
          />
        </svg>
      </div>
    </section>
  );
}
