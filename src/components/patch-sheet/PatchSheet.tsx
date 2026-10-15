"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  associateLegacyPatches,
  decodeImport,
  encodeLibrary,
  parseJson,
  requiredPatchSchemaMinor,
} from "@/lib/adapters/patch-adapter";
import { InstrumentPanel } from "@/components/instrument-panel/InstrumentPanel";
import { PatchManager } from "@/components/patch-manager/PatchManager";
import { SynthLayoutEditor } from "@/components/synth-editor/SynthLayoutEditor";
import { NewSynthDialog } from "@/components/synth-editor/NewSynthDialog";
import { ImportLocalPatches } from "@/components/patch-views/ImportLocalPatches";
import { SampleSection } from "@/components/patch-editor/SampleSection";
import { useAccountPatchLibrary } from "@/hooks/use-account-patch-library";
import { useInstrumentLayoutEditor } from "@/hooks/use-instrument-layout-editor";
import type { SynthView } from "@/lib/synths/synth-service";
import type { PatchLibrary, PatchRecord, PatchCable } from "@/lib/domain/types";
import type { InstrumentDefinition } from "@/lib/instruments/types";
import { authClient } from "@/lib/auth/client";
import {
  activatePatch,
  addPatch,
  mergePatchLibrary,
  patchContentDiffers,
  removePatch,
  updateCables,
  updateKnob,
  updateLed,
  updatePatch,
  updateSwitch,
} from "@/lib/domain/patch-service";
import { LocalPatchRepository } from "@/lib/storage/local-patch-repository";
import { layoutElementPosition } from "@/lib/instrument/layout-editor";
import { useI18n } from "@/i18n/provider";
import type { Locale } from "@/i18n/config";
import { isMessageKey } from "@/i18n/messages";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import { instrumentFromSynth } from "@/lib/instruments/from-synth";
import type { PatchView } from "@/lib/patches/patch-service";

const BUILT_IN_SYNTH = behringerProton.id;
const NOOP = () => {};

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

interface CatalogItem {
  slug: string;
  displayName: string;
  isBuiltIn: boolean;
}

/**
 * The whole app on one page: pick a synth, manage its patches, play them on the panel. Signed-in users
 * keep patches on the server; anonymous visitors keep them in this browser.
 */
export function PatchSheet() {
  const { locale, t } = useI18n();
  const { data: session } = authClient.useSession();
  const searchParams = useSearchParams();
  const debugLayoutEnabled = process.env.NEXT_PUBLIC_DEBUG_LAYOUT === "true";
  const accountUserId = session?.user?.id ?? null;

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selectedSlug, setSelectedSlug] = useState(searchParams.get("synth") ?? BUILT_IN_SYNTH);
  const [view, setView] = useState<SynthView | null>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [shared, setShared] = useState<PatchView | null>(null);
  const [sample, setSample] = useState<PatchView["sample"]>(null);
  const [localLibrary, setLocalLibrary] = useState<PatchLibrary | null>(null);
  const [localStatus, setLocalStatus] = useState(t("status.saved"));
  const [debugEditing, setDebugEditing] = useState(false);
  const [linkedPatchId, setLinkedPatchId] = useState<string | null>(searchParams.get("patch"));
  const browserProtonPatches = useMemo(() => new LocalPatchRepository(behringerProton).load().patches, []);

  const isBuiltIn = selectedSlug === BUILT_IN_SYNTH;
  // The selector must always offer the selected synth, even before the catalog has loaded (MUI warns otherwise).
  const selectorOptions = useMemo(() => {
    if (catalog.some((item) => item.slug === selectedSlug)) return catalog;
    const fallbackName = selectedSlug === BUILT_IN_SYNTH ? behringerProton.displayName : selectedSlug;
    return [...catalog, { slug: selectedSlug, displayName: fallbackName, isBuiltIn: selectedSlug === BUILT_IN_SYNTH }];
  }, [catalog, selectedSlug]);
  // Memoized: the instrument identity drives effects (layout and library loading); a new object per render would loop.
  const instrument: InstrumentDefinition | null = useMemo(
    () => (isBuiltIn ? behringerProton : view ? instrumentFromSynth(view) : null),
    [isBuiltIn, view],
  );
  const isOwner = Boolean(view && accountUserId && view.ownerId === accountUserId);
  const accountMode = Boolean(accountUserId);
  const debugActive = debugLayoutEnabled && isBuiltIn;

  const loadCatalog = useCallback(async () => {
    const response = await fetch("/api/synths", { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as { synths: CatalogItem[] };
    setCatalog(body.synths);
  }, []);

  const loadView = useCallback(async (slug: string) => {
    if (slug === BUILT_IN_SYNTH) return setView(null);
    const response = await fetch(`/api/synths/${encodeURIComponent(slug)}`, { cache: "no-store" });
    setView(response.ok ? ((await response.json()) as SynthView) : null);
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    setEditing(false);
    setView(null);
    void loadView(selectedSlug);
  }, [selectedSlug, loadView]);

  // A patch link from /explore or the old patch pages opens the synth and the patch, read-only unless owned.
  useEffect(() => {
    const patchId = searchParams.get("patch");
    if (!patchId) return;
    void fetch(`/api/patches/${encodeURIComponent(patchId)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: PatchView | null) => {
        if (!body) return;
        setSelectedSlug(body.synth.slug);
        setShared(body.isOwner ? null : body);
      });
  }, [searchParams]);

  const repository = useMemo(() => (instrument ? new LocalPatchRepository(instrument) : null), [instrument]);
  useEffect(() => {
    if (repository) setLocalLibrary(repository.load(t("patch.new")));
  }, [repository, t]);

  const account = useAccountPatchLibrary(selectedSlug, accountMode && instrument !== null);
  const layoutEditor = useInstrumentLayoutEditor(instrument ?? behringerProton, debugActive);
  const debugLayoutMode = debugActive && debugEditing;

  const currentLibrary: PatchLibrary | null = accountMode ? account.library : localLibrary;
  const status = accountMode ? accountStatusText(account.status, t) : localStatus;
  const activePatch: PatchRecord | undefined = currentLibrary?.patches.find((patch) => patch.id === currentLibrary.activeId) ?? currentLibrary?.patches[0];
  const panelData = shared?.data ?? activePatch?.data;
  const panelLayout = debugActive ? layoutEditor.layout : (instrument?.layout ?? null);
  const activeMeta = activePatch && accountMode ? account.meta[activePatch.id] : undefined;
  const ownsActivePatch = Boolean(activePatch && accountMode && !shared);

  // The sample of the active patch is loaded on demand, since the library only holds the patch data.
  useEffect(() => {
    setSample(null);
    if (!activePatch || !accountMode || shared) return;
    void fetch(`/api/patches/${encodeURIComponent(activePatch.id)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: PatchView | null) => setSample(body?.sample ?? null));
  }, [activePatch?.id, accountMode, shared]); // eslint-disable-line

  const commitLibrary = useCallback(
    (next: PatchLibrary, message = t("status.saved")) => {
      if (accountMode) {
        account.commit(next);
        return;
      }
      repository?.save(next);
      setLocalLibrary(next);
      setLocalStatus(message);
    },
    [accountMode, account, repository, t],
  );

  // A patch named in the link becomes active once the library holds it (runs once).
  useEffect(() => {
    if (!linkedPatchId || !currentLibrary?.patches.some((item) => item.id === linkedPatchId)) return;
    setLinkedPatchId(null);
    if (currentLibrary.activeId !== linkedPatchId) commitLibrary(activatePatch(currentLibrary, linkedPatchId));
  }, [linkedPatchId, currentLibrary, commitLibrary]);

  if (!instrument || !currentLibrary || !activePatch) {
    return (
      <Box component="main" sx={{ minHeight: "100vh", display: "grid", placeContent: "center", justifyItems: "center", gap: 2 }}>
        <CircularProgress color="primary" />
        <Typography color="text.secondary">{t("loading.library")}</Typography>
        <PatchManager
          instruments={selectorOptions.map((item) => ({ id: item.slug, displayName: item.displayName }))}
          onCreateSynth={() => setCreating(true)}
          instrumentId={selectedSlug}
          onInstrumentChange={setSelectedSlug}
          patches={[]}
          activeId=""
          activeName=""
          status={status}
          onNameChange={NOOP}
          onSelect={NOOP}
          onCreate={NOOP}
          onRename={NOOP}
          onDelete={NOOP}
          onExport={NOOP}
          onImport={NOOP}
        />
        <NewSynthDialog open={creating} onClose={() => setCreating(false)} onCreated={(slug) => { setCreating(false); void loadCatalog(); setSelectedSlug(slug); }} />
      </Box>
    );
  }

  const library = currentLibrary;
  const patch = activePatch;


  function changeKnob(id: string, value: number) {
    commitLibrary(updateKnob(library, patch.id, id, value));
  }
  function changeSwitch(id: string, value: boolean) {
    commitLibrary(updateSwitch(library, patch.id, id, value));
  }
  function changeLed(id: string, value: boolean) {
    commitLibrary(updateLed(library, patch.id, id, value));
  }
  function changeCables(cables: PatchCable[]) {
    commitLibrary(updateCables(library, patch.id, cables));
  }
  function createPatch() {
    const name = t("patch.newWithNumber", { count: library.patches.length + 1 });
    commitLibrary(addPatch(library, new Date(), name), t("patch.createStatus"));
  }
  function selectInstrument(slug: string) {
    if (slug === selectedSlug) return;
    setLocalLibrary(null);
    setShared(null);
    setSelectedSlug(slug);
  }
  function selectPatch(id: string) {
    setShared(null);
    commitLibrary(activatePatch(library, id), t("patch.opened", { name: library.patches.find((item) => item.id === id)?.name ?? t("patch.generic") }));
  }
  function renamePatch(id: string, name: string) {
    commitLibrary(updatePatch(library, id, { name }), t("patch.renameStatus"));
  }
  function deletePatch(id: string) {
    commitLibrary(removePatch(library, id, new Date(), t("patch.new")), t("patch.deleteStatus"));
  }

  function exportLibrary() {
    const exportedAt = new Date().toISOString();
    const bundle = encodeLibrary(library, selectedSlug, exportedAt, requiredPatchSchemaMinor(library, instrument!));
    makeDownload(`${selectedSlug}-patches-${timestampForFilename(exportedAt)}.json`, JSON.stringify(bundle, null, 2));
    setLocalStatus(t("status.exported", { date: new Intl.DateTimeFormat(dateLocale(locale), { dateStyle: "short", timeStyle: "short" }).format(new Date(exportedAt)) }));
  }

  async function importFile(file: File) {
    try {
      const decoded = parseJson(await file.text());
      const imported = decodeImport(decoded, instrument!);
      const incoming = imported.hasStableIds ? imported.patches : associateLegacyPatches(imported.patches, library.patches);
      const choices: Record<string, "local" | "incoming"> = {};
      for (const incomingPatch of incoming) {
        const local = library.patches.find((candidate) => candidate.id === incomingPatch.id);
        if (!local || !patchContentDiffers(local, incomingPatch)) continue;
        const format = (value: string) => new Intl.DateTimeFormat(dateLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
        const localIsNewer = Date.parse(local.updatedAt) > Date.parse(incomingPatch.updatedAt);
        const useIncoming = window.confirm(t("status.conflict", {
          name: incomingPatch.name,
          localDate: format(local.updatedAt),
          incomingDate: format(incomingPatch.updatedAt),
          localNewer: localIsNewer ? t("conflict.newer") : "",
          incomingNewer: !localIsNewer ? t("conflict.newerOrSame") : "",
        }));
        choices[incomingPatch.id] = useIncoming ? "incoming" : "local";
      }
      const merged = mergePatchLibrary(library, incoming, choices);
      const updatedCount = incoming.filter((item) => choices[item.id] === "incoming").length;
      commitLibrary(merged, t("status.imported", { added: merged.patches.length - library.patches.length, updated: updatedCount }));
    } catch (error: unknown) {
      const message = error instanceof SyntaxError
        ? t("status.importErrorJson")
        : error instanceof Error && isMessageKey(error.message)
          ? t(error.message)
          : error instanceof Error ? error.message : t("status.unknownError");
      setLocalStatus(t("status.importFailed", { message }));
    }
  }

  const ownerCanEdit = isOwner && !isBuiltIn && view !== null;
  // Patches saved in this browser before signing in can be copied to the account (built-in synth only).

  return (
    <>
      <PatchManager
        instruments={selectorOptions.map((item) => ({ id: item.slug, displayName: item.displayName }))}
        onCreateSynth={() => setCreating(true)}
        instrumentId={selectedSlug}
        onInstrumentChange={selectInstrument}
        patches={library.patches}
        activeId={library.activeId}
        activeName={patch.name}
        status={status}
        onNameChange={(name) => renamePatch(patch.id, name)}
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
            {shared ? (
              <Chip size="small" label={t("patches.sharedReadOnly", { name: shared.name })} />
            ) : (
              <Typography variant="caption"><strong>{t("hint.encoder")}</strong> {t("hint.encoderHelp")}</Typography>
            )}
            {ownerCanEdit ? (
              <Button size="small" variant={editing ? "contained" : "outlined"} onClick={() => setEditing((value) => !value)}>
                {editing ? t("synths.doneEditing") : t("synths.edit")}
              </Button>
            ) : null}
            {debugActive ? (
              <FormControlLabel
                control={<Switch checked={debugEditing} onChange={() => { setDebugEditing((value) => !value); layoutEditor.clearFocus(); }} />}
                label={t("debug.adjust")}
              />
            ) : null}
            {ownsActivePatch && !editing ? (
              <>
                <FormControlLabel
                  control={<Switch checked={activeMeta?.visibility === "public"} onChange={(event) => account.updateMeta(patch.id, { visibility: event.target.checked ? "public" : "private" })} />}
                  label={t("patches.publicPatch")}
                />
                <TextField
                  size="small"
                  label={t("patches.tags")}
                  defaultValue={(activeMeta?.tags ?? []).join(", ")}
                  key={`${patch.id}-${(activeMeta?.tags ?? []).join(",")}`}
                  onBlur={(event) => account.updateMeta(patch.id, { tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 10) })}
                  sx={{ width: 220 }}
                />
              </>
            ) : null}
            <Alert severity={status.startsWith(t("status.importFailed")) ? "error" : "success"} variant="standard" role="status" sx={{ ml: "auto", py: 0, alignItems: "center", "& .MuiAlert-message": { typography: "caption" } }}>
              {status}
            </Alert>
            {isBuiltIn && accountMode ? <ImportLocalPatches synthSlug={selectedSlug} patches={browserProtonPatches} /> : null}
          </Stack>
        </Paper>

        {editing && view && isOwner && !isBuiltIn ? (
          <SynthLayoutEditor
            key={`${view.slug}-${view.revision}`}
            source={view}
            onSaved={() => void loadView(view.slug)}
            onClose={() => setEditing(false)}
            onDeleted={() => {
              setEditing(false);
              void loadCatalog();
              setSelectedSlug(BUILT_IN_SYNTH);
            }}
          />
        ) : (
          <>
            <InstrumentPanel
              readOnly={Boolean(shared)}
              data={panelData ?? { knobs: {}, switches: {}, leds: {}, cables: [] }}
              instrument={instrument}
              layout={panelLayout ?? instrument.layout}
              layoutEditMode={debugLayoutMode}
              focusedElement={layoutEditor.focusedElement}
              onFocusLayoutElement={layoutEditor.focus}
              onClearLayoutFocus={layoutEditor.clearFocus}
              onMoveFocusedLayoutElement={layoutEditor.moveFocused}
              onKnobChange={changeKnob}
              onSwitchChange={changeSwitch}
              onLedChange={changeLed}
              onCableChange={changeCables}
            />
            {ownsActivePatch ? (
              <Box sx={{ px: { xs: 2, md: 3 } }}>
                <SampleSection patchId={patch.id} sample={sample} isOwner />
              </Box>
            ) : null}
          </>
        )}

        <Box component="footer" sx={{ display: "flex", justifyContent: "space-between", gap: 2, px: { xs: 2, md: 3 }, py: 1.5, color: "text.secondary", typography: "caption", flexDirection: { xs: "column", md: "row" } }}>
          <Typography variant="caption">{accountMode ? t("footer.accountSaved") : t("footer.autosave")}</Typography>
          <Typography variant="caption" sx={{ fontFamily: "monospace", textAlign: { xs: "left", md: "right" } }}>
            {(panelLayout ?? instrument.layout).knobs.length} {t("footer.knobs")} · {(panelData ?? patch.data).cables.length} {t("footer.cables")} · {t("footer.lastChanged")}{" "}
            {new Intl.DateTimeFormat(dateLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(new Date(patch.updatedAt))}
          </Typography>
        </Box>
      </Box>

      <NewSynthDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(slug) => {
          setCreating(false);
          void loadCatalog();
          setSelectedSlug(slug);
        }}
      />
    </>
  );
}

type Translate = ReturnType<typeof useI18n>["t"];

function accountStatusText(status: "idle" | "saving" | "saved" | "conflict" | "error", t: Translate): string {
  if (status === "saving") return t("status.saving");
  if (status === "conflict") return t("status.conflictReload");
  if (status === "error") return t("status.saveError");
  return t("status.saved");
}

