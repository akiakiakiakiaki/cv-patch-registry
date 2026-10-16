"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import DeleteIcon from "@mui/icons-material/Delete";
import { InstrumentPanel } from "@/components/instrument-panel/InstrumentPanel";
import { useSynthDraft, type SynthDraftSource } from "@/components/synth-editor/use-synth-draft";
import { useI18n } from "@/i18n/provider";
import type { ControlKind } from "@/lib/domain/control-ids";
import type { PatchData } from "@/lib/domain/types";
import type { FocusedLayoutElement } from "@/lib/instrument/layout";
import { genericSwitchAdapter } from "@/lib/instruments/generic-switch-adapter";
import type { InstrumentDefinition } from "@/lib/instruments/types";
import { uploadPanelFile } from "@/components/synth-editor/upload-panel";

const CONTROL_KINDS: readonly ControlKind[] = ["knob", "switch", "led", "in", "out", "uni"];
const EMPTY_DATA: PatchData = { knobs: {}, switches: {}, leds: {}, cables: [] };
const NOOP = () => {};

/** Panel and sidebar for editing a synth's controls. Mounted per synth, so drafts never leak between synths. */
export function SynthLayoutEditor({
  source,
  onSaved,
  onClose,
  onDeleted,
}: {
  source: SynthDraftSource;
  onSaved: () => void;
  onClose: () => void;
  onDeleted: () => void;
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
    if (!result.ok) return setUploadError(t("synths.panelRejected", { reason: result.reason }));
    draft.replacePanel(result.panel);
  }

  const instrument: InstrumentDefinition = {
    id: source.slug,
    displayName: draft.displayName,
    imageSrc: draft.panel.url,
    layoutFile: "",
    layout: draft.layout,
    switchAdapter: genericSwitchAdapter,
  };
  const focusedControl = draft.focused ? draft.controls.find((control) => control.id === draft.focused?.id) : undefined;

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1fr) 360px" }, gap: 3, p: { xs: 2, md: 3 } }}>
      <Box sx={{ position: "relative" }}>
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

      <Stack component="aside" spacing={2} aria-label={t("synths.editorAside")}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="subtitle1" component="h2">{t("synths.editTitle")}</Typography>
          <Button size="small" onClick={onClose}>{t("synths.doneEditing")}</Button>
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
              {focusedControl.kind === "led" ? (
                <TextField select size="small" label={t("synths.color")} value={focusedControl.color ?? "red"} onChange={(event) => draft.setColor(focusedControl.id, event.target.value as "red" | "blue" | "amber")}>
                  {(["red", "blue", "amber"] as const).map((color) => <MenuItem key={color} value={color}>{t(`synths.colorName.${color}`)}</MenuItem>)}
                </TextField>
              ) : null}
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
          <Stack component="ul" spacing={0.5} sx={{ listStyle: "none", p: 0, m: 0, maxHeight: 260, overflow: "auto" }}>
            {draft.controls.map((control) => (
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
                  {control.label} · {t(`synths.kind.${control.kind}`)}
                </Button>
                <IconButton size="small" aria-label={t("synths.removeAria", { label: control.label })} onClick={() => draft.remove(control.id)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Stack>
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

        <Button variant="contained" onClick={() => void draft.save()} disabled={draft.saving || !draft.dirty}>
          {draft.saving ? t("synths.saving") : t("synths.save")}
        </Button>
        {draft.message ? <Alert severity={draft.message.severity} role={draft.message.severity === "error" ? "alert" : "status"}>{draft.message.text}</Alert> : null}
      </Stack>
    </Box>
  );
}

/** Editor kinds map to layout element kinds: knobs, switches and LEDs keep their names, ports are "port". */
function controlKindToLayout(kind: ControlKind): "knob" | "switch" | "led" | "port" {
  if (kind === "knob" || kind === "switch" || kind === "led") return kind;
  return "port";
}
