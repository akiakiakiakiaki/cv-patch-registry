"use client";

import type { KeyboardEvent } from "react";
import { InstrumentArtwork } from "@/components/instrument-artwork/InstrumentArtwork";
import { useI18n } from "@/i18n/provider";
import type { Point } from "@/lib/instrument/layout";
import { InstrumentControlLayer } from "./control-layer/InstrumentControlLayer";
import { PatchCableLayer } from "./patch-cable-layer/PatchCableLayer";
import { CableColorPicker } from "./patch-cable-layer/color-picker/CableColorPicker";
import styles from "./InstrumentPanel.module.scss";
import type { InstrumentPanelProps } from "./types";
import { useInstrumentPanelInteractions } from "./useInstrumentPanelInteractions";

export function InstrumentPanel({
  data,
  instrument,
  layout,
  layoutEditMode,
  focusedElement,
  onFocusLayoutElement,
  onClearLayoutFocus,
  onMoveFocusedLayoutElement,
  onKnobChange,
  onSwitchChange,
  onLedChange,
  onCableChange,
}: InstrumentPanelProps) {
  const { t } = useI18n();
  const interactions = useInstrumentPanelInteractions({
    data,
    layout,
    layoutEditMode,
    onKnobChange,
    onCableChange,
  });

  function handleKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (!layoutEditMode) return;
    const deltas: Record<string, Point> = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
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
          onPointerMove={interactions.handleSvgPointerMove}
          onPointerUp={interactions.finishCableDrag}
          onPointerCancel={interactions.finishCableDrag}
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
            interactions={interactions}
            onFocusLayoutElement={onFocusLayoutElement}
            onKnobChange={onKnobChange}
            onSwitchChange={onSwitchChange}
            onLedChange={onLedChange}
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
