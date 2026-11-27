"use client";

import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { SavingSpinner } from "@/components/admin/SavingSpinner";
import { useSavedValue } from "@/components/admin/use-saved-value";

/** A switch whose state lives on the server (see useSavedValue), with a spinner while saving takes a moment. */
export function SavingSwitch({
  checked,
  save,
  label,
  ariaLabel,
  disabled = false,
  tone = "default",
  onSaved,
  onError,
}: {
  checked: boolean;
  /** Saves the new state; resolves with the state the server confirmed, or null when saving failed. */
  save: (next: boolean) => Promise<boolean | null>;
  /** Visible label for a state; without it only `ariaLabel` names the switch. */
  label?: (checked: boolean) => ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  /** "status": green when on, red when off (e.g. active / deleted). */
  tone?: "default" | "status";
  onSaved?: (checked: boolean) => void;
  onError?: () => void;
}) {
  const { shown, saving, change } = useSavedValue(checked, save, { onSaved, onError });

  const control = (
    <Switch
      checked={shown}
      disabled={disabled || saving}
      color={tone === "status" ? "success" : "primary"}
      onChange={(event) => void change(event.target.checked)}
      slotProps={{ input: { "aria-busy": saving, ...(ariaLabel ? { "aria-label": ariaLabel } : {}) } }}
      sx={
        tone === "status" && !shown
          ? { "& .MuiSwitch-thumb": { bgcolor: "error.main" }, "& .MuiSwitch-track": { bgcolor: "error.main", opacity: 0.5 } }
          : undefined
      }
    />
  );
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
      {label ? <FormControlLabel control={control} label={label(shown)} sx={{ mr: 0 }} /> : control}
      <SavingSpinner saving={saving} />
    </Box>
  );
}
