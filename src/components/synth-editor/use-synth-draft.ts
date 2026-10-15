"use client";

import { useMemo, useState } from "react";
import { draftToLayout } from "@/lib/adapters/synth-layout-adapter";
import type { FocusedLayoutElement, InstrumentLayout } from "@/lib/instrument/layout";
import { useI18n } from "@/i18n/provider";
import {
  addControl,
  clampToPanel,
  controlsFromLayout,
  removeControl,
  updateControl,
  type EditorControl,
} from "@/components/synth-editor/draft-state";
import type { ControlKind } from "@/lib/domain/control-ids";

export interface SynthDraftSource {
  slug: string;
  displayName: string;
  manufacturer: string | null;
  revision: number;
  panelUrl: string;
  layout: InstrumentLayout;
}

interface PanelDraft {
  url: string;
  width: number;
  height: number;
  assetId: string | null;
}

/** Editing state for one synth. Mounted with a key per synth, so switching synths starts clean. */
export function useSynthDraft(source: SynthDraftSource, onSaved: () => void) {
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState(source.displayName);
  const [manufacturer, setManufacturer] = useState(source.manufacturer ?? "");
  const [controls, setControls] = useState<EditorControl[]>(() => controlsFromLayout(source.layout));
  const [panel, setPanel] = useState<PanelDraft>(() => ({
    url: source.panelUrl,
    width: source.layout.viewBox.width,
    height: source.layout.viewBox.height,
    assetId: null,
  }));
  const [revision, setRevision] = useState(source.revision);
  const [focused, setFocused] = useState<FocusedLayoutElement | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ severity: "success" | "error"; text: string } | null>(null);

  const bounds = { width: panel.width, height: panel.height };

  const layout = useMemo(() => {
    const built = draftToLayout(
      { displayName, slug: source.slug, manufacturer, controls },
      bounds,
      source.layout.layoutVersion,
    );
    return built.ok ? built.layout : source.layout;
  }, [displayName, manufacturer, controls, panel.width, panel.height, source]);

  function change<T>(apply: () => T) {
    setDirty(true);
    setMessage(null);
    return apply();
  }

  function addAt(kind: ControlKind, point: { x: number; y: number }) {
    change(() => setControls((previous) => addControl(previous, kind, point, bounds)));
  }

  function addCenter(kind: ControlKind) {
    addAt(kind, { x: panel.width / 2, y: panel.height / 2 });
  }

  /** Keyboard and mouse both move the focused control in half-unit steps. */
  function moveFocused(delta: { x: number; y: number }) {
    if (!focused) return;
    const current = controls.find((control) => control.id === focused.id);
    if (!current) return;
    change(() =>
      setControls((previous) =>
        updateControl(previous, focused.id, { x: current.x + delta.x, y: current.y + delta.y }, bounds),
      ),
    );
  }

  function setPosition(id: string, position: { x?: number; y?: number }) {
    change(() => setControls((previous) => updateControl(previous, id, position, bounds)));
  }

  function setColor(id: string, color: "red" | "blue" | "amber") {
    change(() => setControls((previous) => updateControl(previous, id, { color }, bounds)));
  }

  function rename(id: string, label: string) {
    change(() => setControls((previous) => updateControl(previous, id, { label }, bounds)));
  }

  function remove(id: string) {
    change(() => setControls((previous) => removeControl(previous, id)));
    setFocused((current) => (current?.id === id ? null : current));
  }

  /** New panel image. Controls that would sit outside the new panel are pulled back onto it. */
  function replacePanel(next: { url: string; width: number; height: number; assetId: string }) {
    change(() => {
      setPanel(next);
      setControls((previous) =>
        previous.map((control) => ({ ...control, ...clampToPanel(control, { width: next.width, height: next.height }) })),
      );
    });
  }

  async function save(): Promise<void> {
    setSaving(true);
    setMessage(null);
    const response = await fetch(`/api/synths/${encodeURIComponent(source.slug)}/revisions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName,
        slug: source.slug,
        manufacturer,
        controls,
        expectedRevision: revision,
        ...(panel.assetId ? { panelAssetId: panel.assetId } : {}),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { revision?: number };
    setSaving(false);
    if (response.ok) {
      setRevision(body.revision ?? revision + 1);
      setDirty(false);
      setPanel((current) => ({ ...current, assetId: null }));
      setMessage({ severity: "success", text: t("synths.saved") });
      onSaved();
      return;
    }
    setMessage({ severity: "error", text: response.status === 409 ? t("synths.conflict") : t("synths.invalid") });
  }

  return {
    displayName,
    setDisplayName: (value: string) => change(() => setDisplayName(value)),
    manufacturer,
    setManufacturer: (value: string) => change(() => setManufacturer(value)),
    controls,
    layout,
    panel,
    focused,
    focus: setFocused,
    clearFocus: () => setFocused(null),
    moveFocused,
    addAt,
    addCenter,
    setPosition,
    rename,
    setColor,
    remove,
    replacePanel,
    dirty,
    saving,
    message,
    save,
  };
}

export type SynthDraft = ReturnType<typeof useSynthDraft>;
