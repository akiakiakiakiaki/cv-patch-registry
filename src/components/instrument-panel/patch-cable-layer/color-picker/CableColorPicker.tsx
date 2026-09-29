"use client";

import type { RefObject } from "react";
import type { PatchData } from "@/lib/domain/types";
import { PATCH_CABLE_COLORS } from "@/lib/domain/patch-colors";
import { useI18n } from "@/i18n/provider";
import styles from "../../InstrumentPanel.module.scss";
import type { CableColorPicker as CableColorPickerState } from "../../types";

interface CableColorPickerProps {
  data: PatchData;
  picker: CableColorPickerState | null;
  pickerRef: RefObject<SVGGElement | null>;
  onSelect: (picker: CableColorPickerState, color: string) => void;
}

export function CableColorPicker({
  data,
  picker,
  pickerRef,
  onSelect,
}: CableColorPickerProps) {
  const { t } = useI18n();
  if (!picker) return null;

  return (
    <g
      ref={pickerRef}
      className={styles.cableColorPicker}
      transform={`translate(${picker.x} ${picker.y})`}
      role="group"
      aria-label={t("instrument.colorPicker")}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <rect
        className={styles.cableColorPickerBackground}
        x={0}
        y={0}
        width={166}
        height={38}
        rx={8}
      />
      {PATCH_CABLE_COLORS.map((color, index) => (
        <circle
          key={color.id}
          className={`${styles.cableColorSwatch}${data.cables.some((cable) => cable.from === picker.from && cable.to === picker.to && cable.color === color.value) ? ` ${styles.cableColorSwatchSelected}` : ""}`}
          cx={17 + index * 26}
          cy={19}
          r={9}
          fill={color.value}
          role="button"
          tabIndex={0}
          aria-label={t(`color.${color.id}`)}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(picker, color.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(picker, color.value);
            }
          }}
        />
      ))}
    </g>
  );
}
