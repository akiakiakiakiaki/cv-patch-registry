"use client";

import { useState } from "react";
import TextField from "@mui/material/TextField";
import type { SxProps, Theme } from "@mui/material/styles";

/**
 * Number input that tolerates text on the way to a number (empty, "0.", "-"): only valid numbers inside
 * `min`/`max` are reported, and leaving the field shows the current value again. A value changed elsewhere
 * (e.g. by dragging) replaces the typed text unless that text is still incomplete.
 */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  ariaLabel,
  sx,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Accessible name when it should say more than the visible label. */
  ariaLabel?: string;
  sx?: SxProps<Theme>;
}) {
  const [text, setText] = useState<string | null>(null);
  const parse = (raw: string): number | null => {
    const parsed = Number(raw);
    if (!raw.trim() || !Number.isFinite(parsed)) return null;
    if ((min !== undefined && parsed < min) || (max !== undefined && parsed > max)) return null;
    return parsed;
  };
  const typed = text === null ? null : parse(text);
  const shown = text !== null && (typed === null || typed === value) ? text : String(value);
  return (
    <TextField
      size="small"
      type="number"
      label={label}
      value={shown}
      onChange={(event) => {
        setText(event.target.value);
        const parsed = parse(event.target.value);
        if (parsed !== null && parsed !== value) onChange(parsed);
      }}
      onBlur={() => setText(null)}
      slotProps={{ htmlInput: { min, max, step, ...(ariaLabel ? { "aria-label": ariaLabel } : {}) } }}
      sx={sx}
    />
  );
}
