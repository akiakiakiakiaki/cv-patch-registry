"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import type { PatchRecord } from "@/lib/domain/types";
import type { AppRole } from "@/lib/auth/roles";
import { hasCapability } from "@/lib/auth/roles";
import { PATCH_NAME_MAX_LENGTH } from "@/lib/domain/patch-library";
import { useI18n } from "@/i18n/provider";
import { useConfirmDialog } from "@/components/confirm-dialog/ConfirmDialog";
import { BarSection } from "@/components/app-shell/BarSection";
import { PatchListDialog } from "@/components/patch-manager/PatchListDialog";

export interface InstrumentOption {
  id: string;
  displayName: string;
}

const CREATE_SYNTH = "__create_synth__";
/** Height of MUI's small outlined input (the synth selector); every button of the bar matches it. */
export const BAR_CONTROL_HEIGHT = 40;

interface PatchManagerProps {
  role: AppRole;
  instruments: readonly InstrumentOption[];
  onCreateSynth: () => void;
  instrumentId: string;
  onInstrumentChange: (instrumentId: string) => void;
  patches: readonly PatchRecord[];
  activeId: string;
  status: string;
  /** Shown right of the synth selector, e.g. the synth's Edit/Done button. */
  synthAction?: ReactNode;
  /** Patch list (with download and import) and new patch; hidden in modes where patches cannot be changed. Default true. */
  showPatchActions?: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

export function PatchManager(props: PatchManagerProps) {
  const [listOpen, setListOpen] = useState(false);
  const { t } = useI18n();
  const { confirm, prompt, dialog } = useConfirmDialog();
  const canManageSynths = hasCapability(props.role, "manageSynths");
  const canImportExport = hasCapability(props.role, "importExportPatches");
  const patches = [...props.patches].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );

  async function requestRename(patch: PatchRecord) {
    const name = await prompt({
      title: t("patch.renameTitle"),
      content: null,
      label: t("patch.renamePrompt"),
      initialValue: patch.name,
      maxLength: PATCH_NAME_MAX_LENGTH,
      emptyHint: t("patch.emptyName"),
      confirmLabel: t("patch.rename"),
    });
    if (name !== null) props.onRename(patch.id, name);
  }

  async function requestDelete(patch: PatchRecord) {
    const confirmed = await confirm({
      tone: "danger",
      title: t("patch.deleteTitle"),
      content: t("patch.deleteConfirm", { name: patch.name }),
      confirmLabel: t("confirm.delete"),
    });
    if (confirmed) props.onDelete(patch.id);
  }

  return (
    <>
      <BarSection py={1.5}>
        <Stack
          direction="row"
          useFlexGap
          sx={{
            alignItems: "center",
            flexWrap: "wrap",
            gap: 1.5,
            "& .MuiButton-root": { height: BAR_CONTROL_HEIGHT },
          }}
        >
          <FormControl
            size="small"
            sx={{ minWidth: { xs: "100%", sm: 190 } }}
          >
            <InputLabel id="instrument-select-label">
              {t("instrument.select")}
            </InputLabel>
            <Select
              labelId="instrument-select-label"
              label={t("instrument.select")}
              value={props.instrumentId}
              onChange={(event) => {
                if (event.target.value === CREATE_SYNTH)
                  return props.onCreateSynth();
                props.onInstrumentChange(event.target.value);
              }}
              inputProps={{ "aria-label": t("instrument.selectAria") }}
            >
              {props.instruments.map((instrument) => (
                <MenuItem
                  key={instrument.id}
                  value={instrument.id}
                >
                  {instrument.displayName}
                </MenuItem>
              ))}
              {canManageSynths ? (
                <MenuItem value={CREATE_SYNTH}>+ {t("synths.new")}</MenuItem>
              ) : null}
            </Select>
          </FormControl>

          {props.synthAction}

          {props.showPatchActions !== false ? (
            <Stack
              direction="row"
              useFlexGap
              data-testid="patch-actions"
              sx={{
                alignItems: "center",
                flexWrap: "wrap",
                gap: 1,
                ml: "auto",
              }}
            >
              <Button variant="outlined" aria-haspopup="dialog" onClick={() => setListOpen(true)}>
                {t("patch.list")}
              </Button>
              <Button variant="outlined" onClick={props.onCreate}>
                + {t("patch.new")}
              </Button>
            </Stack>
          ) : null}
        </Stack>
      </BarSection>

      <PatchListDialog
        open={listOpen && props.showPatchActions !== false}
        onClose={() => setListOpen(false)}
        patches={patches}
        activeId={props.activeId}
        status={props.status}
        onSelect={props.onSelect}
        onCreate={props.onCreate}
        onRename={(patch) => void requestRename(patch)}
        onDelete={(patch) => void requestDelete(patch)}
        transfer={canImportExport ? { onExport: props.onExport, onImport: props.onImport } : undefined}
      />
      {/* After the list, so rename and delete questions open above it. */}
      {dialog}
    </>
  );
}
