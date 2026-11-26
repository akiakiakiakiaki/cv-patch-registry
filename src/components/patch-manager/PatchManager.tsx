"use client";

import { useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { PatchRecord } from "@/lib/domain/types";
import type { AppRole } from "@/lib/auth/roles";
import { hasCapability } from "@/lib/auth/roles";
import { PATCH_NAME_MAX_LENGTH } from "@/lib/domain/patch-library";
import { formatTimestamp } from "@/lib/utils/date-format";
import { useI18n } from "@/i18n/provider";
import { useConfirmDialog } from "@/components/confirm-dialog/ConfirmDialog";
import { BarSection } from "@/components/app-shell/BarSection";
import { PAGE_GUTTER } from "@/components/app-shell/layout";

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
  /** Patch list, new patch, download and import; hidden in modes where patches cannot be changed. Default true. */
  showPatchActions?: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

export function PatchManager(props: PatchManagerProps) {
  const [expanded, setExpanded] = useState(false);
  const { locale, t } = useI18n();
  const fileInput = useRef<HTMLInputElement>(null);
  const { confirm, prompt, dialog } = useConfirmDialog();
  const canManageSynths = hasCapability(props.role, "manageSynths");
  const canImportExport = hasCapability(props.role, "importExportPatches");
  const patches = [...props.patches].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );

  function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (file) {
      setExpanded(true);
      props.onImport(file);
    }
    event.currentTarget.value = "";
  }

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
              <Button
                variant="outlined"
                aria-expanded={expanded}
                aria-controls="patchPanel"
                onClick={() => setExpanded((value) => !value)}
              >
                {t("patch.list")} {expanded ? "▴" : "▾"}
              </Button>
              <Button
                variant="outlined"
                onClick={() => {
                  setExpanded(true);
                  props.onCreate();
                }}
              >
                + {t("patch.new")}
              </Button>
              {canImportExport ? (
                <>
                  <Button
                    variant="contained"
                    onClick={props.onExport}
                  >
                    {t("patch.downloadAll")}
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => fileInput.current?.click()}
                  >
                    {t("patch.import")}
                  </Button>
                  <input
                    ref={fileInput}
                    hidden
                    type="file"
                    aria-label={t("patch.import")}
                    accept=".json,application/json"
                    onChange={importFile}
                  />
                </>
              ) : null}
            </Stack>
          ) : null}
        </Stack>
      </BarSection>

      {expanded && props.showPatchActions !== false && (
        <Paper
          id="patchPanel"
          component="section"
          square
          elevation={2}
          aria-label={t("patch.libraryAria")}
          sx={{ position: "relative", zIndex: 2, px: PAGE_GUTTER, py: 2 }}
        >
          <Stack
            direction="row"
            sx={{
              alignItems: "center",
              justifyContent: "space-between",
              mb: 1.5,
            }}
          >
            <Box>
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 700 }}
              >
                {t("patch.local")}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
              >
                {patches.length}{" "}
                {t(patches.length === 1 ? "patch.countOne" : "patch.countMany")}{" "}
                · {props.status}
              </Typography>
            </Box>
            <Button
              size="small"
              onClick={() => setExpanded(false)}
            >
              {t("patch.close")} ×
            </Button>
          </Stack>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fill, minmax(min(100%, 250px), 1fr))",
              gap: 1,
            }}
          >
            {patches.map((patch) => {
              const active = patch.id === props.activeId;
              return (
                <Card
                  key={patch.id}
                  variant="outlined"
                  sx={{
                    borderColor: active ? "primary.main" : "divider",
                    bgcolor: active ? "action.selected" : "background.paper",
                  }}
                >
                  <CardContent sx={{ p: 1, "&:last-child": { pb: 1 } }}>
                    <Button
                      fullWidth
                      color="inherit"
                      aria-current={active ? "true" : undefined}
                      onClick={() => props.onSelect(patch.id)}
                      sx={{
                        justifyContent: "flex-start",
                        textAlign: "left",
                        px: 0.75,
                      }}
                    >
                      <Stack
                        sx={{
                          width: "100%",
                          minWidth: 0,
                          alignItems: "flex-start",
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 700, overflowWrap: "anywhere" }}
                        >
                          {patch.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ overflowWrap: "anywhere" }}
                        >
                          {t("patch.lastChanged")} ·{" "}
                          {formatTimestamp(patch.updatedAt, locale)}
                        </Typography>
                      </Stack>
                    </Button>
                    <Stack
                      direction="row"
                      spacing={0.5}
                      sx={{ justifyContent: "flex-start" }}
                    >
                      <Button
                        size="small"
                        onClick={() => void requestRename(patch)}
                        aria-label={t("patch.renameAria", { name: patch.name })}
                      >
                        {t("patch.rename")}
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => void requestDelete(patch)}
                        aria-label={t("patch.deleteAria", { name: patch.name })}
                      >
                        {t("patch.delete")}
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        </Paper>
      )}
      {dialog}
    </>
  );
}
