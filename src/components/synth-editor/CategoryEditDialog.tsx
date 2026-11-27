"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { AppDialog } from "@/components/app-dialog/AppDialog";
import { NumberField } from "@/components/number-field/NumberField";
import { CATEGORY_SCALE, scaleFactors } from "@/lib/instrument/geometry";
import type { CategoryScale, ControlCategory } from "@/lib/instrument/layout";
import { useI18n } from "@/i18n/provider";

/** Two equal columns: every field of the dialog lines up on this grid. */
const GRID = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 } as const;
const FULL_ROW = { gridColumn: "1 / -1" } as const;

/**
 * Name, color and size of one category. Changes apply right away, like everywhere in the editor;
 * "Done" only closes the dialog.
 */
export function CategoryEditDialog({
  category,
  onClose,
  onRename,
  onRecolor,
  onRescale,
}: {
  category: ControlCategory;
  onClose: () => void;
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onRescale: (scale: CategoryScale) => void;
}) {
  const { t } = useI18n();
  // The page must not be dimmed while the color picker is open: its eyedropper takes colors from the screen.
  const colorInput = useRef<HTMLInputElement>(null);
  const colorPicking = useColorPicking(colorInput);
  const nameMissing = !category.name.trim();
  // Separate factors start at the current factor; back to proportional keeps the width factor.
  const proportional = typeof category.scale !== "object";
  const factors = scaleFactors(category.scale);
  const factorField = { min: CATEGORY_SCALE.min, max: CATEGORY_SCALE.max, step: CATEGORY_SCALE.step, sx: { width: "100%" } };

  return (
    <AppDialog
      open
      onClose={onClose}
      title={t("synths.categoryEditTitle")}
      maxWidth="xs"
      dimBackground={!colorPicking.active}
      actions={
        <Button variant="contained" onClick={onClose}>
          {t("synths.doneEditing")}
        </Button>
      }
    >
      <Box sx={{ ...GRID, pt: 1 }}>
        <TextField
          autoFocus
          size="small"
          label={t("synths.categoryName")}
          value={category.name}
          onChange={(event) => onRename(event.target.value)}
          error={nameMissing}
          helperText={nameMissing ? t("synths.categoryNameMissing") : undefined}
          slotProps={{ htmlInput: { maxLength: 40 } }}
          sx={FULL_ROW}
        />
        <TextField
          size="small"
          type="color"
          label={t("synths.color")}
          value={category.color}
          onChange={(event) => onRecolor(event.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { ref: colorInput, sx: { cursor: "pointer", height: 24 }, ...colorPicking.inputHandlers } }}
        />

        <Typography variant="subtitle2" component="h3" sx={{ ...FULL_ROW, mb: -1 }}>
          {t("synths.categorySize")}
        </Typography>
        <FormControlLabel
          sx={FULL_ROW}
          control={
            <Switch
              checked={proportional}
              onChange={(event) => onRescale(event.target.checked ? factors.x : { x: factors.x, y: factors.x })}
            />
          }
          label={t("synths.categoryProportional")}
        />
        {proportional ? (
          <NumberField {...factorField} label={t("synths.categoryScale")} value={factors.x} onChange={(value) => onRescale(value)} />
        ) : (
          <>
            <NumberField {...factorField} label={t("synths.categoryScaleX")} value={factors.x} onChange={(x) => onRescale({ x, y: factors.y })} />
            <NumberField {...factorField} label={t("synths.categoryScaleY")} value={factors.y} onChange={(y) => onRescale({ x: factors.x, y })} />
          </>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ ...FULL_ROW, mt: -1 }}>
          {t("synths.categoryScaleHint")}
        </Typography>
      </Box>
    </AppDialog>
  );
}

/**
 * Whether the native color picker of `input` is (probably) open. Browsers do not report that directly:
 * it starts when the field is clicked or opened with Enter/Space, and ends when the picker commits its choice
 * (the native "change" event, unlike React's onChange which fires on every input) or the field loses focus.
 */
function useColorPicking(input: RefObject<HTMLInputElement | null>) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const element = input.current;
    if (!element || !active) return;
    const stop = () => setActive(false);
    element.addEventListener("change", stop);
    element.addEventListener("blur", stop);
    return () => {
      element.removeEventListener("change", stop);
      element.removeEventListener("blur", stop);
    };
  }, [active, input]);
  return {
    active,
    inputHandlers: {
      onPointerDown: () => setActive(true),
      onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter" || event.key === " ") setActive(true);
      },
    },
  };
}

