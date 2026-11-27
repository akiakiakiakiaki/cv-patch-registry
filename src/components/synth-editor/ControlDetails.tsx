"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import DeleteIcon from "@mui/icons-material/Delete";
import { ControlCategoryFields } from "@/components/synth-editor/CategorySettings";
import type { EditorControl } from "@/components/synth-editor/draft-state";
import type { SynthDraft } from "@/components/synth-editor/use-synth-draft";
import { controlTypeKey } from "@/components/synth-editor/palette";
import { useI18n } from "@/i18n/provider";

/** Label, position, color, category and switch role of the focused control. */
export function ControlDetails({ control, draft }: { control: EditorControl; draft: SynthDraft }) {
  const { t } = useI18n();
  return (
    <Box sx={{ border: 1, borderColor: "primary.main", borderRadius: 1, p: 1.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        {t(`synths.kind.${controlTypeKey(control)}`)} · {control.id}
      </Typography>
      <Stack spacing={1}>
        <TextField size="small" label={t("synths.label")} value={control.label} onChange={(event) => draft.rename(control.id, event.target.value)} slotProps={{ htmlInput: { maxLength: 40 } }} />
        <Stack direction="row" spacing={1}>
          <TextField size="small" type="number" label={t("synths.x")} value={control.x} onChange={(event) => draft.setPosition(control.id, { x: Number(event.target.value) })} slotProps={{ htmlInput: { step: 0.5 } }} />
          <TextField size="small" type="number" label={t("synths.y")} value={control.y} onChange={(event) => draft.setPosition(control.id, { y: Number(event.target.value) })} slotProps={{ htmlInput: { step: 0.5 } }} />
        </Stack>
        {control.kind === "switch" ? (
          // Changing the construction keeps the ID, so patches keep their state of this switch.
          <TextField
            select
            size="small"
            label={t("synths.switchStyle")}
            value={control.style ?? "button"}
            onChange={(event) => draft.setSwitchStyle(control.id, event.target.value === "slide" ? "slide" : undefined)}
          >
            <MenuItem value="button">{t("synths.kind.switch")}</MenuItem>
            <MenuItem value="slide">{t("synths.kind.slide")}</MenuItem>
          </TextField>
        ) : null}
        {control.kind === "led" && !control.category ? (
          // Only red and blue are offered; stored layouts may still say "amber", which the panel draws blue.
          <TextField select size="small" label={t("synths.color")} value={(control.color ?? "red") === "red" ? "red" : "blue"} onChange={(event) => draft.setColor(control.id, event.target.value as "red" | "blue")}>
            {(["red", "blue"] as const).map((color) => <MenuItem key={color} value={color}>{t(`synths.colorName.${color}`)}</MenuItem>)}
          </TextField>
        ) : null}
        <ControlCategoryFields
          control={control}
          controls={draft.controls}
          categories={draft.categories}
          onSetCategory={draft.setCategory}
          onSetRole={draft.setSwitchRole}
          onSetSelectorCategories={draft.setSelectorCategories}
          onSetDependsOn={draft.setDependsOn}
        />
        <Box>
          <Button color="error" size="small" startIcon={<DeleteIcon />} onClick={() => draft.remove(control.id)}>
            {t("synths.removeAria", { label: control.label })}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
