"use client";

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import Button from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { PatchRecord } from "@/lib/domain/types";
import { formatTimestamp } from "@/lib/utils/date-format";
import { useI18n } from "@/i18n/provider";
import type { InstrumentDefinition } from "@/lib/instruments/types";
import { InlineSvgAsset } from "@/components/inline-svg-asset/InlineSvgAsset";
import { ColorModeSwitch } from "@/components/color-mode-switch/ColorModeSwitch";

interface PatchManagerProps {
  instruments: readonly InstrumentDefinition[];
  instrumentId: string;
  onInstrumentChange: (instrumentId: string) => void;
  patches: readonly PatchRecord[];
  activeId: string;
  activeName: string;
  status: string;
  onNameChange: (name: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

export function PatchManager(props: PatchManagerProps) {
  const [expanded, setExpanded] = useState(false);
  const { locale, setLocale, t } = useI18n();
  const fileInput = useRef<HTMLInputElement>(null);
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

  function requestRename(patch: PatchRecord) {
    const name = window.prompt(t("patch.renamePrompt"), patch.name);
    if (name === null) return;
    if (!name.trim()) {
      window.alert(t("patch.emptyName"));
      return;
    }
    props.onRename(patch.id, name.trim());
  }

  function requestDelete(patch: PatchRecord) {
    if (window.confirm(t("patch.deleteConfirm", { name: patch.name })))
      props.onDelete(patch.id);
  }

  return (
    <>
      <Paper
        component="header"
        square
        elevation={0}
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          px: { xs: 2, md: 3 },
          py: 1.5,
        }}
      >
        <Stack
          direction="row"
          useFlexGap
          sx={{ alignItems: "center", flexWrap: "wrap", gap: 1.5 }}
        >
          <Stack
            direction="row"
            spacing={1.25}
            sx={{ mr: "auto", minWidth: 220, alignItems: "center" }}
          >
            <Paper
              elevation={0}
              sx={{
                width: 38,
                height: 38,
                borderRadius: 1,
                bgcolor: "primary.main",
                display: "grid",
                placeItems: "center",
                "html.light & .brandMarkLogo": {
                  filter: "brightness(0) invert(1)",
                },
              }}
            >
              <InlineSvgAsset
                className="brandMarkLogo"
                src="/logo.svg"
                ariaHidden
                style={{
                  width: 23,
                  height: 23,
                  display: "grid",
                  placeItems: "center",
                }}
              />
            </Paper>
            <Box>
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 700 }}
              >
                {t("brand.title")}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
              >
                {t("brand.subtitle")}
              </Typography>
            </Box>
          </Stack>

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
              onChange={(event) => props.onInstrumentChange(event.target.value)}
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
            </Select>
          </FormControl>

          <TextField
            size="small"
            label={t("patch.active")}
            value={props.activeName}
            slotProps={{
              htmlInput: { maxLength: 60, "aria-label": t("patch.nameAria") },
            }}
            onChange={(event) => props.onNameChange(event.currentTarget.value)}
            sx={{ width: { xs: "100%", sm: 210 } }}
          />

          <Stack
            direction="row"
            useFlexGap
            data-testid="patch-actions"
            sx={{ alignItems: "center", flexWrap: "wrap", gap: 1, ml: "auto" }}
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
          </Stack>
        </Stack>
      </Paper>

      <Box
        data-testid="preference-switches-container"
        sx={{
          position: "fixed",
          right: { xs: 2, sm: 3 },
          bottom: { xs: 2, sm: 3 },
          zIndex: "tooltip",
          px: { xs: 2, md: 3 },
          py: 1.5,
          pointerEvents: "none",
        }}
      >
        <Stack
          direction="row"
          sx={{ alignItems: "center", gap: 1, pointerEvents: "auto" }}
        >
          <ButtonGroup
            size="small"
            aria-label={t("language.label")}
          >
            {(["de", "en"] as const).map((language) => (
              <Button
                key={language}
                aria-pressed={locale === language}
                variant={locale === language ? "contained" : "outlined"}
                onClick={() => setLocale(language)}
              >
                {language.toUpperCase()}
              </Button>
            ))}
          </ButtonGroup>
          <ColorModeSwitch />
        </Stack>
      </Box>

      {expanded && (
        <Paper
          id="patchPanel"
          component="section"
          square
          elevation={2}
          aria-label={t("patch.libraryAria")}
          sx={{ position: "relative", zIndex: 2, px: { xs: 2, md: 3 }, py: 2 }}
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
                        onClick={() => requestRename(patch)}
                        aria-label={t("patch.renameAria", { name: patch.name })}
                      >
                        {t("patch.rename")}
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => requestDelete(patch)}
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
    </>
  );
}
