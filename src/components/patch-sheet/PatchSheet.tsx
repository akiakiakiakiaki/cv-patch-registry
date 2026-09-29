"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import styles from "@/components/patch-sheet/PatchSheet.module.scss";
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
      <main className={styles.loadingState}>
        <div className={styles.loaderMark}>P</div>
        <p>{t("loading.library")}</p>
      </main>
    );
  }
  const currentLibrary = library as PatchLibrary;

  const selectedPatch = currentLibrary.patches.find(
    (patch) => patch.id === currentLibrary.activeId,
  );
  if (!selectedPatch) {
    return (
      <main className={styles.loadingState}>
        <p>{t("loading.noActivePatch")}</p>
      </main>
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
      <main>
        <section className={styles.hintbar}>
          {layoutEditMode ? (
            <span>
                <b>{t("hint.layoutMode")}</b> {t("hint.layoutHelp")}
            </span>
          ) : (
            <>
              <span>
                <b>{t("hint.encoder")}</b> {t("hint.encoderHelp")}
              </span>
              <span>
                <b>{t("hint.switches")}</b> {t("hint.switchesHelp")}
              </span>
              <span>
                <b>{t("hint.cables")}</b> {t("hint.cablesHelp")}
              </span>
            </>
          )}
          {debugLayoutEnabled && (
            <>
              <button
                type="button"
                role="switch"
                aria-checked={layoutEditMode}
                className={`${styles.layoutDebugSwitch}${layoutEditMode ? ` ${styles.enabled}` : ""}`}
                onClick={() => {
                  setLayoutEditMode((enabled) => !enabled);
                  layoutEditor.clearFocus();
                }}
              >
                {t("debug.adjust")}: {layoutEditMode ? t("debug.on") : t("debug.off")}
              </button>
              {layoutEditMode && (
                <>
                  <span
                    className={styles.layoutDebugStatus}
                    role="status"
                    aria-live="polite"
                  >
                    {layoutEditor.focusedElement && focusedPosition
                      ? `${layoutEditor.focusedElement.kind}: ${layoutEditor.focusedElement.id} · x ${focusedPosition.x.toFixed(2)}, y ${focusedPosition.y.toFixed(2)}`
                      : t("debug.noneSelected")}
                    {layoutEditor.message ? ` · ${layoutEditor.message}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => void layoutEditor.save()}
                    disabled={!layoutEditor.dirty || layoutEditor.saving}
                  >
                    {layoutEditor.saving ? t("debug.savingLayout") : t("debug.saveLayout")}
                  </button>
                </>
              )}
            </>
          )}
          <span
            className={styles.status}
            role="status"
          >
            {status}
          </span>
        </section>
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
        <footer className={styles.pageFooter}>
          <span>
            {t("footer.autosave")}
          </span>
          <span>
            {layoutEditor.layout.knobs.length} {t("footer.knobs")} · {activePatch.data.cables.length} {t("footer.cables")} · {t("footer.lastChanged")} {" "}
            {new Intl.DateTimeFormat(dateLocale(locale), {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(activePatch.updatedAt))}
          </span>
        </footer>
      </main>
    </>
  );
}
