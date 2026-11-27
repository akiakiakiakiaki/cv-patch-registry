"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ChangeEvent, Ref } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import DeleteIcon from "@mui/icons-material/Delete";
import { InstrumentPanel } from "@/components/instrument-panel/InstrumentPanel";
import { useConfirmDialog } from "@/components/confirm-dialog/ConfirmDialog";
import { CategoryList, categoryIssueText } from "@/components/synth-editor/CategorySettings";
import { ControlDetails } from "@/components/synth-editor/ControlDetails";
import { ControlGroupList } from "@/components/synth-editor/ControlGroupList";
import { PaletteGhost } from "@/components/synth-editor/PaletteGhost";
import { PALETTE_ITEMS, controlTypeKey, type PaletteItem } from "@/components/synth-editor/palette";
import { ZoomControls } from "@/components/synth-editor/ZoomControls";
import { categoryUsage } from "@/components/synth-editor/category-draft";
import type { EditorControl } from "@/components/synth-editor/draft-state";
import { panelRejectionMessage, uploadPanelFile } from "@/components/synth-editor/upload-panel";
import { useHistoryShortcuts } from "@/components/synth-editor/use-history-shortcuts";
import { usePaletteDrag } from "@/components/synth-editor/use-palette-drag";
import { useSynthDraft, type SynthDraftSource } from "@/components/synth-editor/use-synth-draft";
import { api } from "@/lib/api/client";
import type { ControlKind } from "@/lib/domain/control-ids";
import { EMPTY_PATCH_DATA } from "@/lib/domain/patch-library";
import type { ControlCategory, FocusedLayoutElement, Point } from "@/lib/instrument/layout";
import { createLayoutSwitchAdapter } from "@/lib/instruments/generic-switch-adapter";
import type { InstrumentDefinition } from "@/lib/instruments/types";
import { NOOP } from "@/lib/utils/noop";
import { useI18n } from "@/i18n/provider";
import { PAGE_GUTTER } from "@/components/app-shell/layout";

/** Lets the page leave or close the editor exactly like the editor's own "Done" button. */
export interface SynthLayoutEditorHandle {
  /**
   * Resolves true when the editor may be left: no unsaved changes, or the user saved or discarded them.
   * Resolves false when the user keeps editing or saving failed.
   */
  confirmLeave: () => Promise<boolean>;
  /** confirmLeave, then close. */
  requestClose: () => Promise<void>;
}

/** Panel and sidebar for editing a synth's controls. Mounted per synth, so drafts never leak between synths. */
export function SynthLayoutEditor({
  source,
  onSaved,
  onClose,
  onDeleted,
  onDirtyChange,
  ref,
}: {
  source: SynthDraftSource;
  onSaved: () => void;
  onClose: () => void;
  onDeleted: () => void;
  /** Reports whether there are unsaved changes, e.g. to warn before the tab is closed. */
  onDirtyChange?: (dirty: boolean) => void;
  ref?: Ref<SynthLayoutEditorHandle>;
}) {
  const { t } = useI18n();
  const draft = useSynthDraft(source, onSaved);
  const panelRef = useRef<SVGSVGElement | null>(null);
  const panelFile = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [focusRequestedElement, setFocusRequestedElement] = useState<FocusedLayoutElement | null>(null);
  const clearFocusRequest = useCallback(() => setFocusRequestedElement(null), []);
  const { confirm, choose, dialog: confirmDialog } = useConfirmDialog();
  const [zoom, setZoom] = useState(1);
  // Palette item whose preview tooltip is shown; none while dragging, so the preview never follows the pointer.
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const missingCategoryName = draft.categories.some((category) => !category.name.trim());
  const focusedControl = draft.focused ? draft.controls.find((control) => control.id === draft.focused?.id) : undefined;

  // A palette item dropped on the panel is placed where the pointer is released, and focused.
  const palette = usePaletteDrag(panelRef, draft.panel, (item: PaletteItem, point: Point) => setFocusRequestedElement(draft.addAt(item, point)));
  useHistoryShortcuts(draft.undo, draft.redo);

  async function removeCategory(category: ControlCategory) {
    const count = categoryUsage(draft.controls, category.id);
    if (count > 0) {
      const confirmed = await confirm({
        tone: "warning",
        title: t("synths.categoryRemoveTitle"),
        content: t("synths.categoryRemoveText", { name: category.name, count }),
        confirmLabel: t("synths.categoryRemoveConfirm"),
      });
      if (!confirmed) return;
    }
    draft.removeCategory(category.id);
  }

  /** Inconsistent categories or switch roles are listed first; saving then corrects them. */
  async function save(): Promise<boolean> {
    if (draft.issues.length === 0) return draft.save();
    const confirmed = await confirm({
      tone: "warning",
      title: t("synths.issuesTitle"),
      content: (
        <>
          <Typography gutterBottom>{t("synths.issuesIntro")}</Typography>
          <Box component="ul" sx={{ pl: 3, my: 1 }}>
            {draft.issues.map((issue, index) => (
              <li key={index}>{categoryIssueText(issue, draft.controls, draft.categories, t)}</li>
            ))}
          </Box>
          <Typography variant="body2" color="text.secondary">{t("synths.issuesOutro")}</Typography>
        </>
      ),
      confirmLabel: t("synths.issuesConfirm"),
      cancelLabel: t("synths.issuesCancel"),
    });
    return confirmed ? draft.save({ repair: true }) : false;
  }

  /** Leaving with unsaved changes asks first: save, discard, or keep editing. */
  async function confirmLeave(): Promise<boolean> {
    if (!draft.dirty) return true;
    const choice = await choose({
      tone: "warning",
      title: t("synths.unsavedTitle"),
      content: t("synths.unsavedText"),
      confirmLabel: t("synths.unsavedSave"),
      alternativeLabel: t("synths.unsavedDiscard"),
      cancelLabel: t("synths.unsavedKeepEditing"),
    });
    if (choice === "alternative") return true;
    return choice === "confirm" ? save() : false;
  }

  async function close() {
    if (await confirmLeave()) onClose();
  }

  useImperativeHandle(ref, () => ({ confirmLeave, requestClose: close }));

  useEffect(() => {
    onDirtyChange?.(draft.dirty);
  }, [draft.dirty, onDirtyChange]);

  async function deleteSynth() {
    const confirmed = await confirm({
      tone: "danger",
      title: t("synths.delete"),
      content: t("synths.deleteConfirm", { name: draft.displayName }),
      confirmLabel: t("confirm.delete"),
    });
    if (!confirmed) return;
    setDeleteError(null);
    const response = await api.synths.remove(source.slug);
    if (response.ok) return onDeleted();
    setDeleteError(t("synths.invalid"));
  }

  async function changePanel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const result = await uploadPanelFile(file);
    setUploading(false);
    if (!result.ok) return setUploadError(panelRejectionMessage(result.reason, t));
    draft.replacePanel(result.panel);
  }

  function selectFromList(control: EditorControl) {
    const target = { kind: controlKindToLayout(control.kind), id: control.id };
    draft.focus(target);
    setFocusRequestedElement(target);
  }

  const instrument: InstrumentDefinition = {
    id: source.slug,
    displayName: draft.displayName,
    imageSrc: draft.panel.url,
    layoutFile: "",
    layout: draft.layout,
    switchAdapter: createLayoutSwitchAdapter(draft.layout),
  };

  return (
    // On wide screens the editor fills the space between header and footers (see PatchSheet):
    // the panel area and the sidebar each scroll on their own, the page itself does not.
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1fr) 360px" },
        gridTemplateRows: { lg: "minmax(0, 1fr)" },
        flex: { lg: "1 1 auto" },
        minHeight: { lg: 0 },
        gap: 3,
        p: PAGE_GUTTER,
        alignItems: { xs: "start", lg: "stretch" },
      }}
    >
      <Box sx={{ position: "relative", display: { lg: "flex" }, flexDirection: "column", minHeight: { lg: 0 } }}>
        {/* Above the panel, right-aligned; it never covers the panel. */}
        <Stack direction="row" sx={{ justifyContent: "flex-end", mb: 1 }}>
          <ZoomControls zoom={zoom} onZoomChange={setZoom} />
        </Stack>
        <Box
          data-testid="synth-panel-viewport"
          sx={{ overflow: "auto", maxHeight: { xs: "70vh", lg: "none" }, flex: { lg: "1 1 auto" }, minHeight: { lg: 0 } }}
        >
          <Box data-testid="synth-panel-zoom" style={{ width: `${zoom * 100}%` }}>
            <InstrumentPanel
              data={EMPTY_PATCH_DATA}
              instrument={instrument}
              layout={draft.layout}
              layoutEditMode
              focusedElement={draft.focused}
              placementPreview={palette.placement}
              focusRequestedElement={focusRequestedElement}
              onFocusRequestHandled={clearFocusRequest}
              onDeleteFocusedLayoutElement={({ id }) => draft.remove(id)}
              onFocusLayoutElement={draft.focus}
              onClearLayoutFocus={draft.clearFocus}
              onMoveFocusedLayoutElement={draft.moveFocused}
              onKnobChange={NOOP}
              onSwitchChange={NOOP}
              onLedChange={NOOP}
              onCableChange={NOOP}
              panelRef={panelRef}
            />
          </Box>
        </Box>
      </Box>

      <Stack
        component="aside"
        spacing={2}
        aria-label={t("synths.editorAside")}
        sx={{
          minHeight: { lg: 0 },
          overflowY: { lg: "auto" },
          pr: { lg: 1 },
        }}
      >
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="subtitle1" component="h2">{t("synths.editTitle")}</Typography>
          <Button size="small" onClick={() => void close()}>{t("synths.doneEditing")}</Button>
        </Stack>

        {/* Saving stays in view while the sidebar scrolls: below the app header on narrow screens, at the top of the sidebar on wide ones. */}
        <Stack
          data-testid="synth-editor-save"
          spacing={1}
          sx={{
            position: "sticky",
            top: { xs: "var(--app-header-height, 64px)", lg: 0 },
            // Above MUI's floating input labels (z-index 1) that scroll underneath.
            zIndex: 2,
            bgcolor: "background.default",
            py: 1,
          }}
        >
          <Button variant="contained" onClick={() => void save()} disabled={draft.saving || !draft.dirty || missingCategoryName}>
            {draft.saving ? t("synths.saving") : t("synths.save")}
          </Button>
          {draft.dirty ? <Alert severity="warning" role="status">{t("synths.unsavedHint")}</Alert> : null}
          {missingCategoryName ? <Alert severity="warning">{t("synths.categoryNameMissing")}</Alert> : null}
          {draft.message ? <Alert severity={draft.message.severity} role={draft.message.severity === "error" ? "alert" : "status"}>{draft.message.text}</Alert> : null}
        </Stack>

        <TextField size="small" label={t("synths.displayName")} value={draft.displayName} onChange={(event) => draft.setDisplayName(event.target.value)} />
        <TextField size="small" label={t("synths.manufacturer")} value={draft.manufacturer} onChange={(event) => draft.setManufacturer(event.target.value)} />

        <Box>
          <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>{t("synths.palette")}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>{t("synths.paletteHint")}</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
            {PALETTE_ITEMS.map((item) => (
              // Hovering shows what the control will look like on the panel.
              <Tooltip
                key={controlTypeKey(item)}
                title={<PaletteGhost item={item} layout={draft.layout} />}
                placement="left"
                describeChild
                disableInteractive
                open={hoveredItem === controlTypeKey(item) && !palette.dragging}
                onOpen={() => setHoveredItem(controlTypeKey(item))}
                onClose={() => setHoveredItem((current) => (current === controlTypeKey(item) ? null : current))}
                slotProps={{ tooltip: { sx: { bgcolor: "background.paper", border: 1, borderColor: "divider", p: 1, maxWidth: "none" } } }}
              >
                <Button
                  variant="outlined"
                  size="small"
                  onPointerDown={() => palette.start(item)}
                  onClick={(event) => {
                    // detail 0 means keyboard activation; pointer clicks are placed by the drop listener.
                    if (event.detail === 0) setFocusRequestedElement(draft.addCenter(item));
                  }}
                >
                  {t("synths.addKind", { kind: t(`synths.kind.${controlTypeKey(item)}`) })}
                </Button>
              </Tooltip>
            ))}
          </Box>
        </Box>

        <CategoryList
          categories={draft.categories}
          onAdd={() => draft.addCategory(t("synths.categoryDefaultName", { number: draft.categories.length + 1 }))}
          onRename={draft.renameCategory}
          onRecolor={draft.recolorCategory}
          onRescale={draft.rescaleCategory}
          onMove={draft.moveCategory}
          onRemove={(category) => void removeCategory(category)}
        />

        {focusedControl ? <ControlDetails control={focusedControl} draft={draft} /> : null}

        <ControlGroupList
          controls={draft.controls}
          categories={draft.categories}
          focusedId={draft.focused?.id}
          onSelect={selectFromList}
          onRemove={draft.remove}
        />

        <Box>
          <Button variant="outlined" size="small" disabled={uploading} onClick={() => panelFile.current?.click()}>
            {uploading ? t("synths.uploading") : t("synths.replacePanel")}
          </Button>
          <input ref={panelFile} hidden type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={changePanel} />
          {uploadError ? <Alert severity="error" sx={{ mt: 1 }}>{uploadError}</Alert> : null}
        </Box>

        <Button color="error" variant="outlined" size="small" startIcon={<DeleteIcon />} onClick={() => void deleteSynth()}>
          {t("synths.delete")}
        </Button>
        {deleteError ? <Alert severity="error" role="alert">{deleteError}</Alert> : null}
      </Stack>
      {confirmDialog}
    </Box>
  );
}

/** Editor kinds map to layout element kinds: knobs, switches and LEDs keep their names, ports are "port". */
function controlKindToLayout(kind: ControlKind): "knob" | "switch" | "led" | "port" {
  if (kind === "knob" || kind === "switch" || kind === "led") return kind;
  return "port";
}
