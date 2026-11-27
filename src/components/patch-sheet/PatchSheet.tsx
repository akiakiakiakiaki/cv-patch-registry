"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { InstrumentPanel } from "@/components/instrument-panel/InstrumentPanel";
import { PatchManager } from "@/components/patch-manager/PatchManager";
import { SynthLayoutEditor, type SynthLayoutEditorHandle } from "@/components/synth-editor/SynthLayoutEditor";
import { NewSynthDialog } from "@/components/synth-editor/NewSynthDialog";
import { SampleSection } from "@/components/patch-editor/SampleSection";
import { PAGE_GUTTER } from "@/components/app-shell/layout";
import { useConfirmDialog } from "@/components/confirm-dialog/ConfirmDialog";
import { PATCHES_IMPORTED_EVENT } from "@/components/guest-transfer/GuestPatchTransfer";
import { PatchSettingsBar } from "@/components/patch-sheet/PatchSettingsBar";
import { SynthApprovalStatus } from "@/components/patch-sheet/SynthApprovalStatus";
import { PatchSheetFooter } from "@/components/patch-sheet/PatchSheetFooter";
import { RevisionLossDetails } from "@/components/patch-sheet/RevisionLossDetails";
import { importErrorMessage, importLibraryFile, libraryExport, type ImportConflict } from "@/components/patch-sheet/patch-file";
import { sheetModeLayout, type SheetMode } from "@/components/patch-sheet/sheet-mode";
import type { OutdatedRevision, RevisionLossDecision, RevisionLossPrompt } from "@/hooks/use-account-patch-library";
import { useInstrumentLayoutEditor } from "@/hooks/use-instrument-layout-editor";
import { useSheetLibrary } from "@/hooks/use-sheet-library";
import { useSynthCatalog } from "@/hooks/use-synth-catalog";
import { api } from "@/lib/api/client";
import { authClient } from "@/lib/auth/client";
import { hasCapability, isAdminRole, roleForUser } from "@/lib/auth/roles";
import {
  EMPTY_PATCH_DATA,
  activatePatch,
  addPatch,
  removePatch,
  updateCables,
  updateKnob,
  updateLed,
  updatePatch,
  updateSwitches,
} from "@/lib/domain/patch-library";
import type { PatchCable, PatchRecord } from "@/lib/domain/types";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import { instrumentFromSynth } from "@/lib/instruments/from-synth";
import { useUnsavedChangesGuard } from "@/lib/navigation/use-unsaved-changes-guard";
import type { PatchView } from "@/lib/patches/patch-service";
import { formatTimestamp } from "@/lib/utils/date-format";
import { NOOP } from "@/lib/utils/noop";
import { downloadFile } from "@/lib/utils/download";
import { useI18n } from "@/i18n/provider";
import { synthName } from "@/lib/synths/synth-name";

export const EDITOR_FULL_HEIGHT_CLASS = "editor-full-height";

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

  const synths = useSynthCatalog(searchParams.get("synth") ?? "");
  const { selectedSlug, setSelectedSlug, view, instrument, isBuiltIn } = synths;
  const [sheetMode, setSheetMode] = useState<SheetMode>("patching");
  const [editorDirty, setEditorDirty] = useState(false);
  const [creating, setCreating] = useState(false);
  const [shared, setShared] = useState<PatchView | null>(null);
  const [sample, setSample] = useState<PatchView["sample"]>(null);
  const [debugEditing, setDebugEditing] = useState(false);
  const [linkedPatchId, setLinkedPatchId] = useState<string | null>(searchParams.get("patch"));

  // Owner or admin, decided by the server (see canEditSynth).
  const canEditView = Boolean(view?.canEdit);
  const accountMode = role !== "guest" && Boolean(accountUserId);
  const debugActive = debugLayoutEnabled && isBuiltIn && hasCapability(role, "adjustBuiltInLayout");
  const canManageSynths = hasCapability(role, "manageSynths");

  // Another synth always opens in patching mode.
  useEffect(() => {
    setSheetMode("patching");
  }, [selectedSlug]);

  // A patch link from /explore or the old patch pages opens the synth and the patch, read-only unless owned.
  useEffect(() => {
    const patchId = searchParams.get("patch");
    if (!patchId) return;
    void api.patches.get(patchId).then((response) => {
      if (!response.ok) return;
      setSelectedSlug(response.data.synth.slug);
      setShared(response.data.isOwner ? null : response.data);
    });
  }, [searchParams, setSelectedSlug]);

  const { confirm, choose, dialog: confirmDialog } = useConfirmDialog();
  const editorRef = useRef<SynthLayoutEditorHandle>(null);
  const editorOpen = sheetMode === "editingSynth" && view !== null && canEditView && !isBuiltIn;
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

  useUnsavedChangesGuard(editorOpen, editorDirty, () => editorRef.current?.confirmLeave() ?? Promise.resolve(true));

  const shownSynthName = instrument ? synthName(t, { slug: selectedSlug, displayName: instrument.displayName }) : selectedSlug;
  // A save ran into a synth revision that lacks controls: save (upgrade), restore the saved version, or keep working.
  const decideRevisionLoss = useCallback(
    async (prompt: RevisionLossPrompt): Promise<RevisionLossDecision> => {
      const choice = await choose({
        tone: "warning",
        title: t("revisionLoss.title"),
        content: <RevisionLossDetails prompt={prompt} synthName={shownSynthName} mode="save" />,
        confirmLabel: t("revisionLoss.confirm"),
        alternativeLabel: t("revisionLoss.restore"),
        cancelLabel: t("revisionLoss.cancel"),
      });
      return choice === "confirm" ? "upgrade" : choice === "alternative" ? "restore" : "keep";
    },
    [choose, shownSynthName, t],
  );
  const sheet = useSheetLibrary(selectedSlug, instrument, accountMode, { onRevisionLoss: decideRevisionLoss });
  const { account, commit: commitLibrary, library: currentLibrary, activePatch, status } = sheet;
  // Guest patches copied into the account after signing up (see GuestPatchTransfer) appear without a reload.
  const reloadAccount = account.reload;
  useEffect(() => {
    if (!accountMode) return;
    window.addEventListener(PATCHES_IMPORTED_EVENT, reloadAccount);
    return () => window.removeEventListener(PATCHES_IMPORTED_EVENT, reloadAccount);
  }, [accountMode, reloadAccount]);
  const layoutEditor = useInstrumentLayoutEditor(instrument ?? behringerProton, debugActive);
  const debugLayoutMode = debugActive && debugEditing;

  const panelData = shared?.data ?? activePatch?.data;
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
    void api.patches.get(activePatch.id).then((response) => {
      const body = response.ok ? response.data : null;
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
        content: <RevisionLossDetails prompt={prompt} synthName={shownSynthName} mode="upgrade" />,
        confirmLabel: t("revisionLoss.upgradeConfirm"),
      });
      if (confirmed) void account.upgrade(patch.id);
    },
    [account, confirm, shownSynthName, t, view?.revision],
  );

  // A patch named in the link becomes active once the library holds it (runs once).
  useEffect(() => {
    if (!linkedPatchId || !currentLibrary?.patches.some((item) => item.id === linkedPatchId)) return;
    setLinkedPatchId(null);
    if (currentLibrary.activeId !== linkedPatchId) commitLibrary(activatePatch(currentLibrary, linkedPatchId));
  }, [linkedPatchId, currentLibrary, commitLibrary]);

  async function selectInstrument(slug: string) {
    if (slug === selectedSlug) return;
    // Switching synths leaves the editor; unsaved changes are asked about first.
    if (!(await requestMode("patching"))) return;
    sheet.clearLocal();
    setShared(null);
    setSelectedSlug(slug);
  }

  const managerBase = {
    role,
    instruments: synths.instrumentOptions,
    onCreateSynth: () => setCreating(true),
    instrumentId: selectedSlug,
    onInstrumentChange: (slug: string) => void selectInstrument(slug),
    status,
  };
  const dialogs = (
    <>
      {confirmDialog}
      {canManageSynths ? (
        <NewSynthDialog
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={(slug) => {
            setCreating(false);
            void synths.reloadCatalog();
            setSelectedSlug(slug);
          }}
        />
      ) : null}
    </>
  );

  if (!instrument || !currentLibrary || !activePatch) {
    // Same structure as the loaded page: the control bar stays at the top, only the content area shows the loader.
    return (
      <>
        <PatchManager
          {...managerBase}
          patches={[]}
          activeId=""
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
        {dialogs}
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
    const file = libraryExport(library, instrument!, exportedAt);
    downloadFile(file.filename, file.contents, "application/json");
    sheet.setStatus(t("status.exported", { date: formatTimestamp(exportedAt, locale, "short") }));
  }

  /** A patch that differs between the library and the file: the imported version replaces it only on request. */
  async function useIncomingVersion({ local, incoming }: ImportConflict): Promise<boolean> {
    const localIsNewer = Date.parse(local.updatedAt) > Date.parse(incoming.updatedAt);
    return confirm({
      tone: "warning",
      title: t("import.conflictTitle"),
      content: (
        <Typography sx={{ whiteSpace: "pre-line" }}>
          {t("status.conflict", {
            name: incoming.name,
            localDate: formatTimestamp(local.updatedAt, locale),
            incomingDate: formatTimestamp(incoming.updatedAt, locale),
            localNewer: localIsNewer ? t("conflict.newer") : "",
            incomingNewer: !localIsNewer ? t("conflict.newerOrSame") : "",
          })}
        </Typography>
      ),
      confirmLabel: t("import.useIncoming"),
      cancelLabel: t("import.keepLocal"),
    });
  }

  async function importFile(file: File) {
    try {
      const result = await importLibraryFile(file, library, instrument!, useIncomingVersion);
      commitLibrary(result.library, t("status.imported", { added: result.added, updated: result.updated }));
    } catch (error: unknown) {
      const reason = importErrorMessage(error);
      sheet.setStatus(t("status.importFailed", { message: "key" in reason ? t(reason.key) : reason.text }));
    }
  }

  const ownerCanEdit = canManageSynths && canEditView && !isBuiltIn && view !== null;

  return (
    <>
      <PatchManager
        {...managerBase}
        showPatchActions={modeLayout.patchActions}
        patches={library.patches}
        activeId={library.activeId}
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
          <PatchSettingsBar
            patch={patch}
            sharedName={shared?.name}
            onRename={(name) => renamePatch(patch.id, name)}
            meta={ownsActivePatch ? account.meta[patch.id] : undefined}
            onMetaChange={ownsActivePatch ? (change) => account.updateMeta(patch.id, change) : undefined}
            debug={
              debugActive
                ? {
                    editing: debugEditing,
                    onToggle: () => {
                      setDebugEditing((value) => !value);
                      layoutEditor.clearFocus();
                    },
                  }
                : undefined
            }
            status={status}
            statusIsError={status.startsWith(t("status.importFailed"))}
          />
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
            {t("revisionLoss.outdated", { from: outdated.revision, synth: shownSynthName, to: view?.revision ?? outdated.revision })}
          </Alert>
        ) : null}

        {editorOpen && view ? (
          <SynthLayoutEditor
            ref={editorRef}
            key={`${view.slug}-${view.revision}`}
            source={view}
            onSaved={() => {
              void synths.reloadView(view.slug);
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
              void synths.reloadCatalog();
              // Continue with the next synth of the list.
              setSelectedSlug(synths.slugAfter(view.slug));
            }}
          />
        ) : (
          <>
            <InstrumentPanel
              readOnly={Boolean(shared)}
              data={panelData ?? EMPTY_PATCH_DATA}
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
            {ownerCanEdit ? (
              <Box data-testid="synth-visibility" sx={{ px: PAGE_GUTTER, pt: 1 }}>
                <SynthApprovalStatus
                  key={view.slug}
                  slug={view.slug}
                  approved={view.approved}
                  ownedByViewer={view.ownerId === accountUserId}
                  canApprove={isAdminRole(role)}
                  onApprovalChange={() => {
                    // The view carries the approval, the catalog the "awaiting approval" mark.
                    void synths.reloadView(view.slug);
                    void synths.reloadCatalog();
                  }}
                />
              </Box>
            ) : null}
            {ownsActivePatch ? (
              <Box sx={{ px: PAGE_GUTTER }}>
                {/* Keyed by patch: an opened upload form does not carry over to another patch. */}
                <SampleSection key={patch.id} patchId={patch.id} sample={sample} isOwner onChange={setSample} />
              </Box>
            ) : null}
          </>
        )}

        <PatchSheetFooter
          accountMode={accountMode}
          knobCount={(panelLayout ?? instrument.layout).knobs.length}
          cableCount={(panelData ?? patch.data).cables.length}
          updatedAt={patch.updatedAt}
        />
      </Box>

      {dialogs}
    </>
  );
}
