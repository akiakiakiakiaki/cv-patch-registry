"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import {
  associateLegacyPatches,
  decodeImport,
  encodeLibrary,
  parseJson,
} from "@/lib/adapters/patch-adapter";
import { InstrumentPanel } from "@/components/instrument-panel/InstrumentPanel";
import { PatchManager } from "@/components/patch-manager/PatchManager";
import type { PatchLibrary, PatchRecord, PatchCable } from "@/lib/domain/types";
import { layoutElementPosition } from "@/lib/instrument/layout-editor";
import {
  activatePatch,
  addPatch,
  mergePatchLibrary,
  patchContentDiffers,
  removePatch,
  updateCables,
  updateKnob,
  updateLed,
  updateSwitch,
  updatePatch,
} from "@/lib/domain/patch-service";
import { LocalPatchRepository } from "@/lib/storage/local-patch-repository";
import { useInstrumentLayoutEditor } from "@/hooks/use-instrument-layout-editor";
import { useI18n } from "@/i18n/provider";
import type { Locale } from "@/i18n/config";
import { isMessageKey } from "@/i18n/messages";
import { DEFAULT_INSTRUMENT, DEFAULT_INSTRUMENT_ID, INSTRUMENTS, getInstrument } from "@/lib/instruments/registry";

function dateLocale(locale: Locale): string {
  return locale === "de" ? "de-DE" : "en-US";
}

function makeDownload(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function timestampForFilename(value: string): string {
  return value.replace(/[:.]/g, "-");
}

export function PatchSheet() {
  const { locale, t } = useI18n();
  const debugLayoutEnabled = process.env.NEXT_PUBLIC_DEBUG_LAYOUT === "true";
  const [instrumentId, setInstrumentId] = useState(DEFAULT_INSTRUMENT_ID);
  const instrument = getInstrument(instrumentId) ?? DEFAULT_INSTRUMENT;
  const [layoutEditMode, setLayoutEditMode] = useState(false);
  const layoutEditor = useInstrumentLayoutEditor(instrument, debugLayoutEnabled);
  const repository = useMemo(() => new LocalPatchRepository(instrument), [instrument]);
  const [library, setLibrary] = useState<PatchLibrary | null>(null);
  const [status, setStatus] = useState(t("status.saved"));

  useEffect(() => {
    setLibrary(repository.load(t("patch.new")));
  }, [repository, t]);

  const commitLibrary = useCallback(
    (next: PatchLibrary, message = t("status.saved")) => {
      repository.save(next);
      setLibrary(next);
      setStatus(message);
    },
    [repository, t],
  );

  if (!library) {
    return (
      <Box component="main" sx={{ minHeight: "100vh", display: "grid", placeContent: "center", justifyItems: "center", gap: 2 }}>
        <CircularProgress color="primary" />
        <Typography color="text.secondary">{t("loading.library")}</Typography>
      </Box>
    );
  }
  const currentLibrary = library as PatchLibrary;

  const selectedPatch = currentLibrary.patches.find(
    (patch) => patch.id === currentLibrary.activeId,
  );
  if (!selectedPatch) {
    return (
      <Box component="main" sx={{ minHeight: "100vh", display: "grid", placeContent: "center" }}>
        <Alert severity="warning">{t("loading.noActivePatch")}</Alert>
      </Box>
    );
  }
  const activePatch: PatchRecord = selectedPatch;
  const focusedPosition = layoutEditor.focusedElement
    ? layoutElementPosition(layoutEditor.layout, layoutEditor.focusedElement)
    : undefined;

  function changeKnob(id: string, value: number) {
    commitLibrary(updateKnob(currentLibrary, activePatch.id, id, value));
  }

  function changeSwitch(id: string, value: boolean) {
    commitLibrary(updateSwitch(currentLibrary, activePatch.id, id, value));
  }

  function changeLed(id: string, value: boolean) {
    commitLibrary(updateLed(currentLibrary, activePatch.id, id, value));
  }

  function changeCables(cables: PatchCable[]) {
    commitLibrary(updateCables(currentLibrary, activePatch.id, cables));
  }

  function createPatch() {
    const name = t("patch.newWithNumber", { count: currentLibrary.patches.length + 1 });
    commitLibrary(addPatch(currentLibrary, new Date(), name), t("patch.createStatus"));
  }

  function selectInstrument(nextInstrumentId: string) {
    if (!getInstrument(nextInstrumentId) || nextInstrumentId === instrument.id) return;
    setLibrary(null);
    setLayoutEditMode(false);
    setInstrumentId(nextInstrumentId);
  }

  function selectPatch(id: string) {
    commitLibrary(
      activatePatch(currentLibrary, id),
      t("patch.opened", { name: currentLibrary.patches.find((patch) => patch.id === id)?.name ?? t("patch.generic") }),
    );
  }

  function renamePatch(id: string, name: string) {
    commitLibrary(
      updatePatch(currentLibrary, id, { name }),
      t("patch.renameStatus"),
    );
  }

  function deletePatch(id: string) {
    const nextLibrary = removePatch(currentLibrary, id, new Date(), t("patch.new"));
    commitLibrary(nextLibrary, t("patch.deleteStatus"));
  }

  function exportLibrary() {
    const exportedAt = new Date().toISOString();
    const bundle = encodeLibrary(currentLibrary, instrument.id, exportedAt);
    makeDownload(
      `${instrument.id}-patches-${timestampForFilename(exportedAt)}.json`,
      JSON.stringify(bundle, null, 2),
    );
    setStatus(
      t("status.exported", { date: new Intl.DateTimeFormat(dateLocale(locale), { dateStyle: "short", timeStyle: "short" }).format(new Date(exportedAt)) }),
    );
  }

  async function importFile(file: File) {
    try {
      const decoded = parseJson(await file.text());
      const imported = decodeImport(decoded, instrument);
      const normalizedIncoming = imported.hasStableIds
        ? imported.patches
        : associateLegacyPatches(imported.patches, currentLibrary.patches);
      const choices: Record<string, "local" | "incoming"> = {};
      for (const patch of normalizedIncoming) {
        const local = currentLibrary.patches.find(
          (candidate) => candidate.id === patch.id,
        );
        if (!local || !patchContentDiffers(local, patch)) continue;
        const localDate = new Intl.DateTimeFormat(dateLocale(locale), {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(local.updatedAt));
        const incomingDate = new Intl.DateTimeFormat(dateLocale(locale), {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(patch.updatedAt));
        const localIsNewer =
          Date.parse(local.updatedAt) > Date.parse(patch.updatedAt);
        const useIncoming = window.confirm(t("status.conflict", {
          name: patch.name,
          localDate,
          incomingDate,
          localNewer: localIsNewer ? t("conflict.newer") : "",
          incomingNewer: !localIsNewer ? t("conflict.newerOrSame") : ""
        }));
        choices[patch.id] = useIncoming ? "incoming" : "local";
      }
      const merged = mergePatchLibrary(
        currentLibrary,
        normalizedIncoming,
        choices,
      );
      const newCount = merged.patches.length - currentLibrary.patches.length;
      const updatedCount = normalizedIncoming.filter(
        (patch) => choices[patch.id] === "incoming",
      ).length;
      commitLibrary(
        merged,
        t("status.imported", { added: newCount, updated: updatedCount }),
      );
    } catch (error: unknown) {
      const message = error instanceof SyntaxError
        ? t("status.importErrorJson")
        : error instanceof Error && isMessageKey(error.message)
          ? t(error.message)
          : error instanceof Error
            ? error.message
            : t("status.unknownError");
      setStatus(t("status.importFailed", { message }));
    }
  }

  return (
    <>
      <PatchManager
        instruments={INSTRUMENTS}
        instrumentId={instrument.id}
        onInstrumentChange={selectInstrument}
        patches={library.patches}
        activeId={library.activeId}
        activeName={activePatch.name}
        status={status}
        onNameChange={(name) => renamePatch(activePatch.id, name)}
        onSelect={selectPatch}
        onCreate={createPatch}
        onRename={renamePatch}
        onDelete={deletePatch}
        onExport={exportLibrary}
        onImport={(file) => void importFile(file)}
      />
      <Box component="main">
        <Paper component="section" square variant="outlined" sx={{ px: { xs: 2, md: 3 }, py: 1, borderTop: 0, borderLeft: 0, borderRight: 0 }}>
          <Stack direction="row" useFlexGap sx={{ alignItems: "center", flexWrap: "wrap", gap: 1.5 }}>
          {layoutEditMode ? (
            <Typography variant="caption"><strong>{t("hint.layoutMode")}</strong> {t("hint.layoutHelp")}</Typography>
          ) : (
            <>
              <Typography variant="caption"><strong>{t("hint.encoder")}</strong> {t("hint.encoderHelp")}</Typography>
              <Typography variant="caption"><strong>{t("hint.switches")}</strong> {t("hint.switchesHelp")}</Typography>
              <Typography variant="caption"><strong>{t("hint.cables")}</strong> {t("hint.cablesHelp")}</Typography>
            </>
          )}
          {debugLayoutEnabled && (
            <>
              <FormControlLabel
                control={<Switch checked={layoutEditMode} onChange={() => { setLayoutEditMode((enabled) => !enabled); layoutEditor.clearFocus(); }} />}
                label={t("debug.adjust")}
              />
              {layoutEditMode && (
                <>
                  <Typography variant="caption" color="secondary.main" role="status" aria-live="polite" sx={{ fontFamily: "monospace" }}>
                    {layoutEditor.focusedElement && focusedPosition
                      ? `${layoutEditor.focusedElement.kind}: ${layoutEditor.focusedElement.id} · x ${focusedPosition.x.toFixed(1)}, y ${focusedPosition.y.toFixed(1)}`
                      : t("debug.noneSelected")}
                    {layoutEditor.message ? ` · ${layoutEditor.message}` : ""}
                  </Typography>
                  <Button
                    variant="outlined"
                    onClick={() => void layoutEditor.save()}
                    disabled={!layoutEditor.dirty || layoutEditor.saving}
                  >
                    {layoutEditor.saving ? t("debug.savingLayout") : t("debug.saveLayout")}
                  </Button>
                </>
              )}
            </>
          )}
          <Alert
            severity={status.startsWith(t("status.importFailed")) ? "error" : "success"}
            variant="standard"
            role="status"
            sx={{ ml: "auto", py: 0, alignItems: "center", "& .MuiAlert-message": { typography: "caption" } }}
          >
            {status}
          </Alert>
          </Stack>
        </Paper>
        <InstrumentPanel
          data={activePatch.data}
          instrument={instrument}
          layout={layoutEditor.layout}
          layoutEditMode={layoutEditMode}
          focusedElement={layoutEditor.focusedElement}
          onFocusLayoutElement={layoutEditor.focus}
          onClearLayoutFocus={layoutEditor.clearFocus}
          onMoveFocusedLayoutElement={layoutEditor.moveFocused}
          onKnobChange={changeKnob}
          onSwitchChange={changeSwitch}
          onLedChange={changeLed}
          onCableChange={changeCables}
        />
        <Box component="footer" sx={{ display: "flex", justifyContent: "space-between", gap: 2, px: { xs: 2, md: 3 }, py: 1.5, color: "text.secondary", typography: "caption", flexDirection: { xs: "column", md: "row" } }}>
          <Typography variant="caption">{t("footer.autosave")}</Typography>
          <Typography variant="caption" sx={{ fontFamily: "monospace", textAlign: { xs: "left", md: "right" } }}>
            {layoutEditor.layout.knobs.length} {t("footer.knobs")} · {activePatch.data.cables.length} {t("footer.cables")} · {t("footer.lastChanged")} {" "}
            {new Intl.DateTimeFormat(dateLocale(locale), {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(activePatch.updatedAt))}
          </Typography>
        </Box>
      </Box>
    </>
  );
}
