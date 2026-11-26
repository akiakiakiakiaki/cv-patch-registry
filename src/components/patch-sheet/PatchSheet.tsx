"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { SynthLayoutEditor, type SynthLayoutEditorHandle } from "@/components/synth-editor/SynthLayoutEditor";
import { NewSynthDialog } from "@/components/synth-editor/NewSynthDialog";
import { SampleSection } from "@/components/patch-editor/SampleSection";
import { useAccountPatchLibrary } from "@/hooks/use-account-patch-library";
import { useInstrumentLayoutEditor } from "@/hooks/use-instrument-layout-editor";
import type { SynthView } from "@/lib/synths/synth-service";
import type { PatchLibrary, PatchRecord, PatchCable } from "@/lib/domain/types";
import type { InstrumentDefinition } from "@/lib/instruments/types";
import { authClient } from "@/lib/auth/client";
import { hasCapability, roleForUser } from "@/lib/auth/roles";
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
  updateSwitches,
} from "@/lib/domain/patch-service";
import { LocalPatchRepository } from "@/lib/storage/local-patch-repository";
import { loadLocalLibrary } from "@/lib/storage/legacy-proton-local";
import { initialSynthSlug, readLastSynth, writeLastSynth } from "@/lib/storage/last-synth";
import { LEGACY_PROTON_SLUG, PROTON_CLONE_SLUG, decodeLegacyProtonExportForClone, isLegacyProtonExport } from "@/lib/adapters/proton-legacy-migration-adapter";
import { layoutElementPosition } from "@/lib/instrument/layout-editor";
import { useI18n } from "@/i18n/provider";
import { useConfirmDialog } from "@/components/confirm-dialog/ConfirmDialog";
import { RevisionLossDetails } from "@/components/patch-sheet/RevisionLossDetails";
import { TagInput } from "@/components/patch-sheet/TagInput";
import { PATCHES_IMPORTED_EVENT } from "@/components/guest-transfer/GuestPatchTransfer";
import { sheetModeLayout, type SheetMode } from "@/components/patch-sheet/sheet-mode";
import { setLeaveGuard } from "@/lib/navigation/leave-guard";
import { useConfirmLinkNavigation } from "@/lib/navigation/use-confirm-link-navigation";
import type { OutdatedRevision, RevisionLossDecision, RevisionLossPrompt } from "@/hooks/use-account-patch-library";
import type { Locale } from "@/i18n/config";
import { isMessageKey } from "@/i18n/messages";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import { instrumentFromSynth } from "@/lib/instruments/from-synth";
import type { PatchView } from "@/lib/patches/patch-service";

const BUILT_IN_SYNTH = behringerProton.id;
const NOOP = () => {};
export const EDITOR_FULL_HEIGHT_CLASS = "editor-full-height";

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
  const role = roleForUser(session?.user);

  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  // Empty until known: the URL names a synth, or the catalog decides (last opened, else first).
  const [selectedSlug, setSelectedSlug] = useState(searchParams.get("synth") ?? "");
  const [view, setView] = useState<SynthView | null>(null);
  const [sheetMode, setSheetMode] = useState<SheetMode>("patching");
  const [editorDirty, setEditorDirty] = useState(false);
  const [creating, setCreating] = useState(false);
  const [shared, setShared] = useState<PatchView | null>(null);
  const [sample, setSample] = useState<PatchView["sample"]>(null);
  const [localLibrary, setLocalLibrary] = useState<PatchLibrary | null>(null);
  const [localStatus, setLocalStatus] = useState(t("status.saved"));
  const [debugEditing, setDebugEditing] = useState(false);
  const [linkedPatchId, setLinkedPatchId] = useState<string | null>(searchParams.get("patch"));

  // The built-in Proton comes with the app, but is only offered while the server lists it (FEATURE_LEGACY_SYNTHS).
  const builtInListed = catalog?.some((item) => item.slug === BUILT_IN_SYNTH) ?? false;
  const isBuiltIn = selectedSlug === BUILT_IN_SYNTH && builtInListed;
  // The selector must always offer the selected synth, even before the catalog has loaded (MUI warns otherwise).
  const selectorOptions = useMemo(() => {
    const items = catalog ?? [];
    if (!selectedSlug || items.some((item) => item.slug === selectedSlug)) return items;
    if (selectedSlug === BUILT_IN_SYNTH && catalog) return items;
    const fallbackName = selectedSlug === BUILT_IN_SYNTH ? behringerProton.displayName : selectedSlug;
    return [...items, { slug: selectedSlug, displayName: fallbackName, isBuiltIn: selectedSlug === BUILT_IN_SYNTH }];
  }, [catalog, selectedSlug]);
  // The built-in Proton is kept next to its editable clone until removed; the list marks it as legacy.
  const instrumentOptions = useMemo(
    () =>
      selectorOptions.map((item) => ({
        id: item.slug,
        displayName: item.slug === LEGACY_PROTON_SLUG ? t("instrument.legacyName", { name: item.displayName }) : item.displayName,
      })),
    [selectorOptions, t],
  );
  // Memoized: the instrument identity drives effects (layout and library loading); a new object per render would loop.
  const instrument: InstrumentDefinition | null = useMemo(
    () => (isBuiltIn ? behringerProton : view ? instrumentFromSynth(view) : null),
    [isBuiltIn, view],
  );
  const isOwner = Boolean(view && accountUserId && view.ownerId === accountUserId);
  const accountMode = role !== "guest" && Boolean(accountUserId);
  const debugActive = debugLayoutEnabled && isBuiltIn && hasCapability(role, "adjustBuiltInLayout");
  const canManageSynths = hasCapability(role, "manageSynths");

  const loadCatalog = useCallback(async () => {
    const response = await fetch("/api/synths", { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as { synths: CatalogItem[] };
    setCatalog(body.synths);
  }, []);

  const loadView = useCallback(async (slug: string) => {
    if (!slug || slug === BUILT_IN_SYNTH) return setView(null);
    const response = await fetch(`/api/synths/${encodeURIComponent(slug)}`, { cache: "no-store" });
    setView(response.ok ? ((await response.json()) as SynthView) : null);
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (!catalog) return;
    // Nothing chosen yet, or a link to the hidden legacy Proton: open the last or first listed synth instead.
    const hiddenBuiltIn = selectedSlug === BUILT_IN_SYNTH && !builtInListed;
    if (!selectedSlug || hiddenBuiltIn) setSelectedSlug(initialSynthSlug(readLastSynth(), catalog) ?? "");
  }, [catalog, selectedSlug, builtInListed]);

  useEffect(() => {
    if (selectedSlug) writeLastSynth(selectedSlug);
  }, [selectedSlug]);

  useEffect(() => {
    setSheetMode("patching");
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
    if (repository && instrument) setLocalLibrary(loadLocalLibrary(repository, instrument.id, t("patch.new")));
  }, [repository, instrument, t]);

  const { confirm, choose, dialog: confirmDialog } = useConfirmDialog();
  const editorRef = useRef<SynthLayoutEditorHandle>(null);
  const editorOpen = sheetMode === "editingSynth" && view !== null && isOwner && !isBuiltIn;
  // The mode actually shown: editing needs an editable synth, otherwise the sheet stays in patching.
  const modeLayout = sheetModeLayout(editorOpen ? "editingSynth" : "patching");
  // Wide screens show the app at window height in modes that ask for it (see .editor-full-height in globals.scss).
  useEffect(() => {
    if (!modeLayout.fillWindow) return;
    document.documentElement.classList.add(EDITOR_FULL_HEIGHT_CLASS);
    return () => document.documentElement.classList.remove(EDITOR_FULL_HEIGHT_CLASS);
  }, [modeLayout.fillWindow]);

  /**
   * The one way to switch modes. Leaving the synth editor asks about unsaved changes first (save, discard,
   * keep editing); resolves false when the user stays.
   */
  const requestMode = useCallback(
    async (next: SheetMode): Promise<boolean> => {
      if (next === sheetMode) return true;
      if (editorOpen && editorRef.current && !(await editorRef.current.confirmLeave())) return false;
      setSheetMode(next);
      return true;
    },
    [sheetMode, editorOpen],
  );

  // Leaving from outside the sheet (signing out) asks the editor too; closing the tab gets the browser's warning.
  useEffect(() => {
    if (!editorOpen) return;
    return setLeaveGuard(() => editorRef.current?.confirmLeave() ?? Promise.resolve(true));
  }, [editorOpen]);
  // Links inside the app ask too (client-side navigation does not trigger the browser's warning).
  useConfirmLinkNavigation(editorOpen && editorDirty);
  useEffect(() => {
    if (!editorOpen || !editorDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editorOpen, editorDirty]);
  const synthName = instrument?.displayName ?? selectedSlug;
  // A save ran into a synth revision that lacks controls: save (upgrade), restore the saved version, or keep working.
  const decideRevisionLoss = useCallback(
    async (prompt: RevisionLossPrompt): Promise<RevisionLossDecision> => {
      const choice = await choose({
        tone: "warning",
        title: t("revisionLoss.title"),
        content: <RevisionLossDetails prompt={prompt} synthName={synthName} mode="save" />,
        confirmLabel: t("revisionLoss.confirm"),
        alternativeLabel: t("revisionLoss.restore"),
        cancelLabel: t("revisionLoss.cancel"),
      });
      return choice === "confirm" ? "upgrade" : choice === "alternative" ? "restore" : "keep";
    },
    [choose, synthName, t],
  );
  const account = useAccountPatchLibrary(selectedSlug, accountMode && instrument !== null, { onRevisionLoss: decideRevisionLoss });
  // Guest patches copied into the account after signing up (see GuestPatchTransfer) appear without a reload.
  const reloadAccount = account.reload;
  useEffect(() => {
    if (!accountMode) return;
    window.addEventListener(PATCHES_IMPORTED_EVENT, reloadAccount);
    return () => window.removeEventListener(PATCHES_IMPORTED_EVENT, reloadAccount);
  }, [accountMode, reloadAccount]);
  const layoutEditor = useInstrumentLayoutEditor(instrument ?? behringerProton, debugActive);
  const debugLayoutMode = debugActive && debugEditing;

  const currentLibrary: PatchLibrary | null = accountMode ? account.library : localLibrary;
  const status = accountMode ? accountStatusText(account.status, t) : localStatus;
  const activePatch: PatchRecord | undefined = currentLibrary?.patches.find((patch) => patch.id === currentLibrary.activeId) ?? currentLibrary?.patches[0];
  const panelData = shared?.data ?? activePatch?.data;
  const activeMeta = activePatch && accountMode ? account.meta[activePatch.id] : undefined;
  const ownsActivePatch = Boolean(activePatch && accountMode && !shared);
  // A patch kept on an older synth revision is shown and edited with that revision's panel and controls.
  const outdated = ownsActivePatch && activePatch ? account.outdated[activePatch.id] : undefined;
  const [activeView, setActiveView] = useState<PatchView | null>(null);
  const outdatedInstrument = useMemo(
    () => (outdated && activeView && activeView.id === activePatch?.id ? instrumentFromSynth(activeView.synth) : null),
    [outdated, activeView, activePatch?.id],
  );
  const panelInstrument = outdatedInstrument ?? instrument;
  const panelLayout = debugActive ? layoutEditor.layout : (panelInstrument?.layout ?? null);

  // Sample and own-revision panel of the active patch are loaded on demand; the library only holds the patch data.
  // A new patch is asked for only once the server has it, so its create request is not answered with 404.
  const activeSaved = activePatch ? account.savedIds.has(activePatch.id) : false;
  useEffect(() => {
    setSample(null);
    if (!activePatch || !accountMode || shared || !activeSaved) return;
    void fetch(`/api/patches/${encodeURIComponent(activePatch.id)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: PatchView | null) => {
        setSample(body?.sample ?? null);
        setActiveView(body);
      });
  }, [activePatch?.id, accountMode, shared, outdated?.revision, activeSaved]); // eslint-disable-line

  const askUpgrade = useCallback(
    async (patch: PatchRecord, info: OutdatedRevision) => {
      const toRevision = view?.revision ?? info.revision;
      const prompt = { patchName: patch.name, fromRevision: info.revision, toRevision, losses: info.losses };
      const confirmed = await confirm({
        tone: "warning",
        title: t("revisionLoss.upgradeTitle", { to: toRevision }),
        content: <RevisionLossDetails prompt={prompt} synthName={synthName} mode="upgrade" />,
        confirmLabel: t("revisionLoss.upgradeConfirm"),
      });
      if (confirmed) void account.upgrade(patch.id);
    },
    [account, confirm, synthName, t, view?.revision],
  );

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
    // Same structure as the loaded page: the control bar stays at the top, only the content area shows the loader.
    return (
      <>
        <PatchManager
          role={role}
          instruments={instrumentOptions}
          onCreateSynth={() => setCreating(true)}
          instrumentId={selectedSlug}
          onInstrumentChange={setSelectedSlug}
          patches={[]}
          activeId=""
          status={status}
          onSelect={NOOP}
          onCreate={NOOP}
          onRename={NOOP}
          onDelete={NOOP}
          onExport={NOOP}
          onImport={NOOP}
        />
        <Box component="main" aria-busy="true" sx={{ minHeight: "50vh", display: "grid", placeContent: "center", justifyItems: "center", gap: 2 }}>
          <CircularProgress color="primary" />
          <Typography color="text.secondary">{t("loading.library")}</Typography>
        </Box>
        {canManageSynths ? (
          <NewSynthDialog
            open={creating}
            onClose={() => setCreating(false)}
            onCreated={(slug) => {
              setCreating(false);
              void loadCatalog();
              setSelectedSlug(slug);
            }}
          />
        ) : null}
      </>
    );
  }

  const library = currentLibrary;
  const patch = activePatch;


  function changeKnob(id: string, value: number) {
    commitLibrary(updateKnob(library, patch.id, id, value));
  }
  function changeSwitch(updates: Readonly<Record<string, boolean>>) {
    commitLibrary(updateSwitches(library, patch.id, updates));
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
  async function selectInstrument(slug: string) {
    if (slug === selectedSlug) return;
    // Switching synths leaves the editor; unsaved changes are asked about first.
    if (!(await requestMode("patching"))) return;
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
      // A legacy Proton export is migrated when imported into the editable clone.
      const imported =
        instrument!.id === PROTON_CLONE_SLUG && isLegacyProtonExport(decoded)
          ? decodeLegacyProtonExportForClone(decoded)
          : decodeImport(decoded, instrument!);
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

  const ownerCanEdit = canManageSynths && isOwner && !isBuiltIn && view !== null;

  return (
    <>
      <PatchManager
        role={role}
        instruments={instrumentOptions}
        onCreateSynth={() => setCreating(true)}
        instrumentId={selectedSlug}
        onInstrumentChange={(slug) => void selectInstrument(slug)}
        showPatchActions={modeLayout.patchActions}
        patches={library.patches}
        activeId={library.activeId}
        status={status}
        synthAction={
          ownerCanEdit ? (
            <Button
              // Same size as the other buttons of the bar. "Done" behaves exactly like the editor's own "Done" button.
              variant={editorOpen ? "contained" : "outlined"}
              onClick={() => void requestMode(editorOpen ? "patching" : "editingSynth")}
            >
              {editorOpen ? t("synths.doneEditing") : t("synths.edit")}
            </Button>
          ) : null
        }
        onSelect={selectPatch}
        onCreate={createPatch}
        onRename={renamePatch}
        onDelete={deletePatch}
        onExport={exportLibrary}
        onImport={(file) => void importFile(file)}
      />

      <Box
        component="main"
        sx={modeLayout.fillWindow ? { display: { lg: "flex" }, flexDirection: "column", flex: { lg: "1 1 auto" }, minHeight: { lg: 0 } } : undefined}
      >
        {/* Patch settings; hidden while the synth editor is open, where they have no effect. */}
        {modeLayout.patchRow ? (
        <Paper component="section" square variant="outlined" sx={{ px: { xs: 2, md: 3 }, py: 1, borderTop: 0, borderLeft: 0, borderRight: 0 }}>
          <Stack direction="row" useFlexGap sx={{ alignItems: "center", flexWrap: "wrap", gap: 1.5 }}>
            {shared ? (
              <Chip size="small" label={t("patches.sharedReadOnly", { name: shared.name })} />
            ) : (
              <TextField
                size="small"
                label={t("patch.active")}
                value={patch.name}
                slotProps={{ htmlInput: { maxLength: 60, "aria-label": t("patch.nameAria") } }}
                onChange={(event) => renamePatch(patch.id, event.currentTarget.value)}
                sx={{ width: { xs: "100%", sm: 210 } }}
              />
            )}
            {debugActive ? (
              <FormControlLabel
                control={<Switch checked={debugEditing} onChange={() => { setDebugEditing((value) => !value); layoutEditor.clearFocus(); }} />}
                label={t("debug.adjust")}
              />
            ) : null}
            {ownsActivePatch ? (
              <>
                <FormControlLabel
                  control={<Switch checked={activeMeta?.visibility === "public"} onChange={(event) => account.updateMeta(patch.id, { visibility: event.target.checked ? "public" : "private" })} />}
                  label={t("patches.publicPatch")}
                />
                <TagInput key={patch.id} value={activeMeta?.tags ?? []} onChange={(tags) => account.updateMeta(patch.id, { tags })} />
              </>
            ) : null}
            <Alert severity={status.startsWith(t("status.importFailed")) ? "error" : "success"} variant="standard" role="status" sx={{ ml: "auto", py: 0, alignItems: "center", "& .MuiAlert-message": { typography: "caption" } }}>
              {status}
            </Alert>
          </Stack>
        </Paper>
        ) : null}

        {outdated && !editorOpen ? (
          <Alert
            severity="warning"
            square
            action={
              <Button color="inherit" size="small" onClick={() => void askUpgrade(patch, outdated)}>
                {t("revisionLoss.upgradeAction")}
              </Button>
            }
          >
            {t("revisionLoss.outdated", { from: outdated.revision, synth: synthName, to: view?.revision ?? outdated.revision })}
          </Alert>
        ) : null}

        {editorOpen && view ? (
          <SynthLayoutEditor
            ref={editorRef}
            key={`${view.slug}-${view.revision}`}
            source={view}
            onSaved={() => {
              void loadView(view.slug);
              // A new revision can make patches outdated; reload to show which.
              if (accountMode) account.reload();
            }}
            onDirtyChange={setEditorDirty}
            onClose={() => {
              setEditorDirty(false);
              setSheetMode("patching");
            }}
            onDeleted={() => {
              setEditorDirty(false);
              setSheetMode("patching");
              void loadCatalog();
              // Continue with the next synth of the list.
              setSelectedSlug((catalog ?? []).find((item) => item.slug !== view.slug)?.slug ?? "");
            }}
          />
        ) : (
          <>
            <InstrumentPanel
              readOnly={Boolean(shared)}
              data={panelData ?? { knobs: {}, switches: {}, leds: {}, cables: [] }}
              instrument={panelInstrument ?? instrument}
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
                <SampleSection patchId={patch.id} sample={sample} isOwner onChange={setSample} />
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

      {confirmDialog}
      {canManageSynths ? (
        <NewSynthDialog
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={(slug) => {
            setCreating(false);
            void loadCatalog();
            setSelectedSlug(slug);
          }}
        />
      ) : null}
    </>
  );
}

type Translate = ReturnType<typeof useI18n>["t"];

function accountStatusText(status: "idle" | "saving" | "saved" | "conflict" | "error", t: Translate): string {
  if (status === "saving") return t("status.saving");
  if (status === "conflict") return t("status.conflictReload");
  if (status === "error") return t("status.saveError");
  // Signed-in users' patches live on the server only; "status.saved" is the browser-storage message for guests.
  return t("status.savedAccount");
}

