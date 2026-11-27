"use client";

import { useState } from "react";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import { CATEGORY_SCALE, scaleFactors } from "@/lib/instrument/geometry";
import type { CategoryScale } from "@/lib/instrument/layout";
import { useI18n } from "@/i18n/provider";

/**
 * Scale of a category's controls: one factor while proportional, otherwise one for width and one for height.
 * Switching to separate factors starts both at the current factor; back to proportional keeps the width factor.
 */
export function CategoryScaleFields({
  name,
  scale,
  onChange,
}: {
  /** Category name, for the field labels read by screen readers. */
  name: string;
  scale: CategoryScale | undefined;
  onChange: (scale: CategoryScale) => void;
}) {
  const { t } = useI18n();
  const proportional = typeof scale !== "object";
  const factors = scaleFactors(scale);
  return (
    <Stack direction="row" useFlexGap sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}>
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={proportional}
            onChange={(event) => onChange(event.target.checked ? factors.x : { x: factors.x, y: factors.x })}
            slotProps={{ input: { "aria-label": t("synths.categoryProportional", { name }) } }}
          />
        }
        label={t("synths.categoryProportionalShort")}
      />
      {proportional ? (
        <FactorField label={t("synths.categoryScale")} ariaLabel={t("synths.categoryScaleAria", { name })} value={factors.x} onChange={(value) => onChange(value)} />
      ) : (
        <>
          <FactorField label={t("synths.categoryScaleX")} ariaLabel={t("synths.categoryScaleXAria", { name })} value={factors.x} onChange={(x) => onChange({ x, y: factors.y })} />
          <FactorField label={t("synths.categoryScaleY")} ariaLabel={t("synths.categoryScaleYAria", { name })} value={factors.y} onChange={(y) => onChange({ x: factors.x, y })} />
        </>
      )}
    </Stack>
  );
}

/**
 * Number field for one factor. Typing may pass through invalid text (e.g. "0."); only values inside the
 * limits are reported, and leaving the field shows the last valid value again.
 */
function FactorField({ label, ariaLabel, value, onChange }: { label: string; ariaLabel: string; value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <TextField
      size="small"
      type="number"
      label={label}
      value={text ?? String(value)}
      onChange={(event) => {
        setText(event.target.value);
        const parsed = Number(event.target.value);
        if (event.target.value.trim() && Number.isFinite(parsed) && parsed >= CATEGORY_SCALE.min && parsed <= CATEGORY_SCALE.max) onChange(parsed);
      }}
      onBlur={() => setText(null)}
      slotProps={{ htmlInput: { min: CATEGORY_SCALE.min, max: CATEGORY_SCALE.max, step: CATEGORY_SCALE.step, "aria-label": ariaLabel } }}
      sx={{ width: 96 }}
    />
  );
}
