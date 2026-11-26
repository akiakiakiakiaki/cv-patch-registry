"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Ref } from "react";
import type { ChangeEvent } from "react";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import Paper from "@mui/material/Paper";
import { InstrumentPanel } from "@/components/instrument-panel/InstrumentPanel";
import { useSynthDraft, type SynthDraftSource } from "@/components/synth-editor/use-synth-draft";
import { useI18n } from "@/i18n/provider";
import type { ControlKind } from "@/lib/domain/control-ids";
import type { PatchData } from "@/lib/domain/types";
import type { FocusedLayoutElement } from "@/lib/instrument/layout";
import { createLayoutSwitchAdapter } from "@/lib/instruments/generic-switch-adapter";
import type { InstrumentDefinition } from "@/lib/instruments/types";
import { panelRejectionMessage, uploadPanelFile } from "@/components/synth-editor/upload-panel";
import { CategoryList, ColorDot, ControlCategoryFields, categoryIssueText } from "@/components/synth-editor/CategorySettings";
import { historyShortcut } from "@/components/synth-editor/control-history";
import { categoryUsage, fixedColorOf, shownCategoryIds } from "@/components/synth-editor/category-draft";
import { useConfirmDialog } from "@/components/confirm-dialog/ConfirmDialog";
import type { ControlCategory } from "@/lib/instrument/layout";

const CONTROL_KINDS: readonly ControlKind[] = ["knob", "switch", "led", "in", "out", "uni"];
const EMPTY_DATA: PatchData = { knobs: {}, switches: {}, leds: {}, cables: [] };
const NOOP = () => {};
/** On wide screens the panel stays below the sticky app header while only the sidebar scrolls. */
/** Panel zoom while placing controls: 100 % is the full available width; each step adds or removes 50 %. */
const ZOOM_STEP = 0.5;
const ZOOM_MAX = 2.5;

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
  const [dragKind, setDragKind] = useState<ControlKind | null>(null);
  // The preview uses panel coordinates so its shape and size match the placed control.
  const [preview, setPreview] = useState<{ x: number; y: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [focusRequestedElement, setFocusRequestedElement] = useState<FocusedLayoutElement | null>(null);
  const clearFocusRequest = useCallback(() => setFocusRequestedElement(null), []);
  const { confirm, choose, dialog: confirmDialog } = useConfirmDialog();
  const [zoom, setZoom] = useState(1);
  // Control groups start collapsed; the group of the focused control opens so it is visible in the list.
  const [openGroups, setOpenGroups] = useState<ReadonlySet<ControlKind>>(() => new Set());
  const focusedKind = draft.focused ? draft.controls.find((control) => control.id === draft.focused?.id)?.kind : undefined;
  useEffect(() => {
    if (focusedKind) setOpenGroups((current) => (current.has(focusedKind) ? current : new Set([...current, focusedKind])));
  }, [focusedKind, draft.focused?.id]);
  const toggleGroup = (kind: ControlKind, open: boolean) =>
    setOpenGroups((current) => {
      const next = new Set(current);
      if (open) next.add(kind);
      else next.delete(kind);
      return next;
    });
  const missingCategoryName = draft.categories.some((category) => !category.name.trim());

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

  // Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z undo and redo control changes, except in text fields and open dialogs.
  const undoRedo = useRef({ undo: draft.undo, redo: draft.redo });
  undoRedo.current = { undo: draft.undo, redo: draft.redo };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = historyShortcut(event);
      if (!action || (event.target instanceof Element && event.target.closest('[role="dialog"]'))) return;
      event.preventDefault();
      undoRedo.current[action]();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function deleteSynthNow() {
    if (!window.confirm(t("synths.deleteConfirm", { name: draft.displayName }))) return;
    setDeleteError(null);
    const response = await fetch(`/api/synths/${encodeURIComponent(source.slug)}`, { method: "DELETE" });
    if (response.ok) return onDeleted();
    setDeleteError(t("synths.invalid"));
  }

  // Palette drag: a palette item dropped on the panel is placed where the pointer is released.
  useEffect(() => {
    if (!dragKind) return;
    const locate = (event: PointerEvent): { x: number; y: number } | null => {
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) return null;
      return {
        x: ((event.clientX - rect.left) / rect.width) * draft.panel.width,
        y: ((event.clientY - rect.top) / rect.height) * draft.panel.height,
      };
    };
    const move = (event: PointerEvent) => {
      setPreview(locate(event));
    };
    const drop = (event: PointerEvent) => {
      const point = locate(event);
      if (point) setFocusRequestedElement(draft.addAt(dragKind, point));
      setDragKind(null);
      setPreview(null);
    };
    const cancel = () => {
      setDragKind(null);
      setPreview(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [dragKind, draft.panel.width, draft.panel.height]);

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

  const instrument: InstrumentDefinition = {
    id: source.slug,
    displayName: draft.displayName,
    imageSrc: draft.panel.url,
    layoutFile: "",
    layout: draft.layout,
    switchAdapter: createLayoutSwitchAdapter(draft.layout),
  };
  const focusedControl = draft.focused ? draft.controls.find((control) => control.id === draft.focused?.id) : undefined;

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
        p: { xs: 2, md: 3 },
        alignItems: { xs: "start", lg: "stretch" },
      }}
    >
      <Box sx={{ position: "relative", display: { lg: "flex" }, flexDirection: "column", minHeight: { lg: 0 } }}>
        {/* Above the panel, right-aligned; it never covers the panel. */}
        <Stack direction="row" sx={{ justifyContent: "flex-end", mb: 1 }}>
        <Paper
          variant="outlined"
          role="group"
          aria-label={t("synths.zoomGroup")}
          sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 0.5 }}
        >
            <IconButton size="small" aria-label={t("synths.zoomOut")} disabled={zoom <= 1} onClick={() => setZoom((value) => Math.max(1, value - ZOOM_STEP))}>
              <ZoomOutIcon fontSize="small" />
            </IconButton>
            <Typography variant="caption" aria-live="polite" sx={{ minWidth: 40, textAlign: "center", alignSelf: "center" }}>
              {t("synths.zoomLevel", { percent: Math.round(zoom * 100) })}
            </Typography>
            <IconButton size="small" aria-label={t("synths.zoomIn")} disabled={zoom >= ZOOM_MAX} onClick={() => setZoom((value) => Math.min(ZOOM_MAX, value + ZOOM_STEP))}>
              <ZoomInIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" aria-label={t("synths.zoomReset")} disabled={zoom === 1} onClick={() => setZoom(1)}>
              <FitScreenIcon fontSize="small" />
            </IconButton>
        </Paper>
        </Stack>
        <Box
          data-testid="synth-panel-viewport"
          sx={{ overflow: "auto", maxHeight: { xs: "70vh", lg: "none" }, flex: { lg: "1 1 auto" }, minHeight: { lg: 0 } }}
        >
          <Box data-testid="synth-panel-zoom" style={{ width: `${zoom * 100}%` }}>
        <InstrumentPanel
          data={EMPTY_DATA}
          instrument={instrument}
          layout={draft.layout}
          layoutEditMode
          focusedElement={draft.focused}
          placementPreview={dragKind && preview ? { kind: dragKind, point: preview } : null}
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
            {CONTROL_KINDS.map((kind) => (
              <Button
                key={kind}
                variant="outlined"
                size="small"
                onPointerDown={() => setDragKind(kind)}
                onClick={(event) => {
                  // detail 0 means keyboard activation; pointer clicks are placed by the drop listener.
                  if (event.detail === 0) setFocusRequestedElement(draft.addCenter(kind));
                }}
              >
                {t("synths.addKind", { kind: t(`synths.kind.${kind}`) })}
              </Button>
            ))}
          </Box>
        </Box>

        <CategoryList
          categories={draft.categories}
          onAdd={() => draft.addCategory(t("synths.categoryDefaultName", { number: draft.categories.length + 1 }))}
          onRename={draft.renameCategory}
          onRecolor={draft.recolorCategory}
          onMove={draft.moveCategory}
          onRemove={(category) => void removeCategory(category)}
        />

        {focusedControl ? (
          <Box sx={{ border: 1, borderColor: "primary.main", borderRadius: 1, p: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
              {t(`synths.kind.${focusedControl.kind}`)} · {focusedControl.id}
            </Typography>
            <Stack spacing={1}>
              <TextField size="small" label={t("synths.label")} value={focusedControl.label} onChange={(event) => draft.rename(focusedControl.id, event.target.value)} slotProps={{ htmlInput: { maxLength: 40 } }} />
              <Stack direction="row" spacing={1}>
                <TextField size="small" type="number" label={t("synths.x")} value={focusedControl.x} onChange={(event) => draft.setPosition(focusedControl.id, { x: Number(event.target.value) })} slotProps={{ htmlInput: { step: 0.5 } }} />
                <TextField size="small" type="number" label={t("synths.y")} value={focusedControl.y} onChange={(event) => draft.setPosition(focusedControl.id, { y: Number(event.target.value) })} slotProps={{ htmlInput: { step: 0.5 } }} />
              </Stack>
              {focusedControl.kind === "led" && !focusedControl.category ? (
                // Only red and blue are offered; stored layouts may still say "amber", which the panel draws blue.
                <TextField select size="small" label={t("synths.color")} value={(focusedControl.color ?? "red") === "red" ? "red" : "blue"} onChange={(event) => draft.setColor(focusedControl.id, event.target.value as "red" | "blue")}>
                  {(["red", "blue"] as const).map((color) => <MenuItem key={color} value={color}>{t(`synths.colorName.${color}`)}</MenuItem>)}
                </TextField>
              ) : null}
              <ControlCategoryFields
                control={focusedControl}
                controls={draft.controls}
                categories={draft.categories}
                onSetCategory={draft.setCategory}
                onSetRole={draft.setSwitchRole}
                onSetSelectorCategories={draft.setSelectorCategories}
                onSetDependsOn={draft.setDependsOn}
              />
              <Box>
                <Button color="error" size="small" startIcon={<DeleteIcon />} onClick={() => draft.remove(focusedControl.id)}>
                  {t("synths.removeAria", { label: focusedControl.label })}
                </Button>
              </Box>
            </Stack>
          </Box>
        ) : null}

        <Box>
          <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>{t("synths.controls")} ({draft.controls.length})</Typography>
          {CONTROL_KINDS.map((kind) => {
            const group = draft.controls.filter((control) => control.kind === kind);
            if (group.length === 0) return null;
            return (
              <Accordion
                key={kind}
                disableGutters
                elevation={0}
                variant="outlined"
                expanded={openGroups.has(kind)}
                onChange={(_event, open) => toggleGroup(kind, open)}
                slotProps={{ transition: { unmountOnExit: true } }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />} aria-controls={`controls-${kind}`} id={`controls-${kind}-header`}>
                  <Typography variant="body2">{t("synths.controlGroup", { group: t(`synths.kindGroup.${kind}`), count: group.length })}</Typography>
                </AccordionSummary>
                <AccordionDetails id={`controls-${kind}`} sx={{ pt: 0 }}>
          <Stack component="ul" spacing={0.5} sx={{ listStyle: "none", p: 0, m: 0 }}>
            {group.map((control) => (
              <Box component="li" key={control.id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Button
                  size="small"
                  onClick={() => {
                    const target = { kind: controlKindToLayout(control.kind), id: control.id };
                    draft.focus(target);
                    setFocusRequestedElement(target);
                  }}
                  sx={{ justifyContent: "flex-start", flex: 1, textAlign: "left" }}
                >
                  {shownCategoryIds(control, draft.controls).map((categoryId) => (
                    <ColorDot key={categoryId} categoryId={categoryId} color={draft.categories.find((category) => category.id === categoryId)?.color} />
                  ))}
                  {fixedColorOf(control) ? <ColorDot fixed color={fixedColorOf(control)} /> : null}
                  {control.label} · {t(`synths.kind.${control.kind}`)}
                </Button>
                <IconButton size="small" aria-label={t("synths.removeAria", { label: control.label })} onClick={() => draft.remove(control.id)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Stack>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Box>

        <Box>
          <Button variant="outlined" size="small" disabled={uploading} onClick={() => panelFile.current?.click()}>
            {uploading ? t("synths.uploading") : t("synths.replacePanel")}
          </Button>
          <input ref={panelFile} hidden type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={changePanel} />
          {uploadError ? <Alert severity="error" sx={{ mt: 1 }}>{uploadError}</Alert> : null}
        </Box>

        <Button color="error" variant="outlined" size="small" startIcon={<DeleteIcon />} onClick={() => void deleteSynthNow()}>
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
