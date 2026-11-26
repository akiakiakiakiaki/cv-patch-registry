"use client";

import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import { BarSection } from "@/components/app-shell/BarSection";
import { TagInput } from "@/components/patch-sheet/TagInput";
import type { PatchMeta } from "@/hooks/use-account-patch-library";
import { PATCH_NAME_MAX_LENGTH } from "@/lib/domain/patch-library";
import type { PatchRecord } from "@/lib/domain/types";
import { useI18n } from "@/i18n/provider";

/** Name, visibility and tags of the active patch, plus the save status. A shared patch only shows its name. */
export function PatchSettingsBar({
  patch,
  sharedName,
  onRename,
  meta,
  onMetaChange,
  debug,
  status,
  statusIsError,
}: {
  patch: PatchRecord;
  /** Name of a patch shared with the user, shown read-only instead of the own patch. */
  sharedName?: string;
  onRename: (name: string) => void;
  /** Visibility and tags; only for the owner's patches in the account. */
  meta?: PatchMeta;
  onMetaChange?: (change: Partial<PatchMeta>) => void;
  /** Switch for adjusting the built-in layout (developers only). */
  debug?: { editing: boolean; onToggle: () => void };
  status: string;
  statusIsError: boolean;
}) {
  const { t } = useI18n();
  return (
    <BarSection>
      <Stack direction="row" useFlexGap sx={{ alignItems: "center", flexWrap: "wrap", gap: 1.5 }}>
        {sharedName !== undefined ? (
          <Chip size="small" label={t("patches.sharedReadOnly", { name: sharedName })} />
        ) : (
          <TextField
            size="small"
            label={t("patch.active")}
            value={patch.name}
            slotProps={{ htmlInput: { maxLength: PATCH_NAME_MAX_LENGTH, "aria-label": t("patch.nameAria") } }}
            onChange={(event) => onRename(event.currentTarget.value)}
            sx={{ width: { xs: "100%", sm: 210 } }}
          />
        )}
        {debug ? (
          <FormControlLabel control={<Switch checked={debug.editing} onChange={debug.onToggle} />} label={t("debug.adjust")} />
        ) : null}
        {onMetaChange ? (
          <>
            <FormControlLabel
              control={
                <Switch
                  checked={meta?.visibility === "public"}
                  onChange={(event) => onMetaChange({ visibility: event.target.checked ? "public" : "private" })}
                />
              }
              label={t("patches.publicPatch")}
            />
            <TagInput key={patch.id} value={meta?.tags ?? []} onChange={(tags) => onMetaChange({ tags })} />
          </>
        ) : null}
        <Alert
          severity={statusIsError ? "error" : "success"}
          variant="standard"
          role="status"
          sx={{ ml: "auto", py: 0, alignItems: "center", "& .MuiAlert-message": { typography: "caption" } }}
        >
          {status}
        </Alert>
      </Stack>
    </BarSection>
  );
}
