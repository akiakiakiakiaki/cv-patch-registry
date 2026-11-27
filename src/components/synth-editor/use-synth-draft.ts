"use client";

import { useMemo, useRef, useState } from "react";
import { draftToLayout } from "@/lib/adapters/synth-layout-adapter";
import type { CategoryScale, ControlCategory, FocusedLayoutElement, InstrumentLayout, SwitchStyle } from "@/lib/instrument/layout";
import type { PaletteItem } from "@/components/synth-editor/palette";
import { api } from "@/lib/api/client";
import { useI18n } from "@/i18n/provider";
import {
  addCategory as addCategoryTo,
  draftCategoryIssues,
  generateCategoryId,
  nextCategoryColor,
  recolorCategory as recolorCategoryIn,
  rescaleCategory as rescaleCategoryIn,
  removeCategory as removeCategoryFrom,
  renameCategory as renameCategoryIn,
  repairCategoryRoles,
  setControlCategory,
  setDependsOn as setDependsOnIn,
  setSelectorCategories as setSelectorCategoriesIn,
  setSwitchRole as setSwitchRoleIn,
  moveItem,
  type SwitchRole,
} from "@/components/synth-editor/category-draft";
import { emptyHistory, recordChange, redoStep, undoStep, type History } from "@/components/synth-editor/control-history";
import {
  addControl,
  clampToPanel,
  controlsFromLayout,
  removeControl,
  updateControl,
  type EditorControl,
} from "@/components/synth-editor/draft-state";
import { generateControlId } from "@/lib/domain/control-ids";

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
  const [categories, setCategories] = useState<ControlCategory[]>(() => [...(source.layout.categories ?? [])]);
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

  const issues = useMemo(() => draftCategoryIssues(categories, controls), [categories, controls]);

  // The preview always shows a consistent configuration; unresolved issues are reported on save.
  const layout = useMemo(() => {
    const repaired = repairCategoryRoles(categories, controls);
    const built = draftToLayout(
      { displayName, slug: source.slug, manufacturer, controls: repaired.controls, categories: repaired.categories },
      bounds,
      source.layout.layoutVersion,
    );
    return built.ok ? built.layout : source.layout;
  }, [displayName, manufacturer, controls, categories, panel.width, panel.height, source]);

  function change<T>(apply: () => T) {
    setDirty(true);
    setMessage(null);
    return apply();
  }

  // Undo/redo covers every change of the controls. The latest controls are kept in a ref, so a change is
  // computed and recorded once, outside of React's state updaters (which may run twice in development).
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const history = useRef<History<EditorControl[]>>(emptyHistory());

  /** Applies a change of the controls and records it; `key` merges follow-up changes of the same kind (see control-history). */
  function updateControls(apply: (previous: EditorControl[]) => EditorControl[], key?: string) {
    const previous = controlsRef.current;
    const next = apply(previous);
    if (next === previous) return;
    history.current = recordChange(history.current, previous, key, Date.now());
    controlsRef.current = next;
    change(() => setControls(next));
  }

  /** Sets the controls without a history step and forgets the history (it could restore invalid states). */
  function replaceControls(next: EditorControl[]) {
    history.current = emptyHistory();
    controlsRef.current = next;
    setControls(next);
  }

  function restore(step: { history: History<EditorControl[]>; value: EditorControl[] } | null): boolean {
    if (!step) return false;
    history.current = step.history;
    controlsRef.current = step.value;
    change(() => setControls(step.value));
    setFocused((current) => (current && step.value.some((control) => control.id === current.id) ? current : null));
    return true;
  }

  const undo = () => restore(undoStep(history.current, controlsRef.current));
  const redo = () => restore(redoStep(history.current, controlsRef.current));

  function addAt({ kind, style }: PaletteItem, point: { x: number; y: number }): FocusedLayoutElement {
    const id = generateControlId(kind);
    updateControls((previous) => addControl(previous, kind, point, bounds, id, style));
    const target: FocusedLayoutElement = {
      kind: kind === "knob" || kind === "switch" || kind === "led" ? kind : "port",
      id,
    };
    setFocused(target);
    return target;
  }

  function addCenter(item: PaletteItem): FocusedLayoutElement {
    return addAt(item, { x: panel.width / 2, y: panel.height / 2 });
  }

  /** Keyboard and mouse both move the focused control in half-unit steps. */
  function moveFocused(delta: { x: number; y: number }) {
    if (!focused) return;
    const id = focused.id;
    updateControls((previous) => {
      const current = previous.find((control) => control.id === id);
      return current ? updateControl(previous, id, { x: current.x + delta.x, y: current.y + delta.y }, bounds) : previous;
    }, `move:${id}`);
  }

  function setPosition(id: string, position: { x?: number; y?: number }) {
    updateControls((previous) => updateControl(previous, id, position, bounds), `position:${id}`);
  }

  function setColor(id: string, color: "red" | "blue") {
    updateControls((previous) => updateControl(previous, id, { color }, bounds));
  }

  /** Push button or slide switch; the ID, and with it every patch's state, stays the same. */
  function setSwitchStyle(id: string, style: SwitchStyle | undefined) {
    updateControls((previous) =>
      previous.map((control) => {
        if (control.id !== id || control.kind !== "switch") return control;
        const { style: _previous, ...rest } = control;
        return style ? { ...rest, style } : rest;
      }),
    );
  }

  function rename(id: string, label: string) {
    updateControls((previous) => updateControl(previous, id, { label }, bounds), `rename:${id}`);
  }

  function remove(id: string) {
    updateControls((previous) => removeControl(previous, id));
    setFocused((current) => (current?.id === id ? null : current));
  }

  function addCategory(name: string): string {
    const id = generateCategoryId();
    change(() => setCategories((previous) => addCategoryTo(previous, { id, name, color: nextCategoryColor(previous) })));
    return id;
  }

  function renameCategory(id: string, name: string) {
    change(() => setCategories((previous) => renameCategoryIn(previous, id, name)));
  }

  function recolorCategory(id: string, color: string) {
    change(() => setCategories((previous) => recolorCategoryIn(previous, id, color)));
  }

  function rescaleCategory(id: string, scale: CategoryScale) {
    change(() => setCategories((previous) => rescaleCategoryIn(previous, id, scale)));
  }

  function moveCategory(id: string, delta: -1 | 1) {
    change(() => setCategories((previous) => moveItem(previous, previous.findIndex((category) => category.id === id), delta)));
  }

  function removeCategory(id: string) {
    change(() => {
      const next = removeCategoryFrom(categories, controlsRef.current, id);
      setCategories(next.categories);
      replaceControls(next.controls);
    });
  }

  function setCategory(id: string, categoryId: string | undefined) {
    updateControls((previous) => setControlCategory(previous, id, categoryId));
  }

  function setSwitchRole(id: string, role: SwitchRole) {
    updateControls((previous) => setSwitchRoleIn(previous, categories, id, role));
  }

  function setSelectorCategories(id: string, selects: readonly string[]) {
    updateControls((previous) => setSelectorCategoriesIn(previous, id, selects));
  }

  function setDependsOn(id: string, parentId: string) {
    updateControls((previous) => setDependsOnIn(previous, id, parentId));
  }

  /** New panel image. Controls that would sit outside the new panel are pulled back onto it. */
  function replacePanel(next: { url: string; width: number; height: number; assetId: string }) {
    change(() => {
      setPanel(next);
      replaceControls(controlsRef.current.map((control) => ({ ...control, ...clampToPanel(control, { width: next.width, height: next.height }) })));
    });
  }

  /**
   * With `repair`, inconsistent categories and switch roles are corrected first (see repairCategoryRoles).
   * Resolves true when a new revision was saved.
   */
  async function save(options: { repair?: boolean } = {}): Promise<boolean> {
    const repaired = options.repair ? repairCategoryRoles(categories, controlsRef.current) : { categories, controls: controlsRef.current };
    if (options.repair) {
      setCategories(repaired.categories);
      controlsRef.current = repaired.controls;
      setControls(repaired.controls);
    }
    setSaving(true);
    setMessage(null);
    const response = await api.synths.saveRevision(source.slug, {
      displayName,
      slug: source.slug,
      manufacturer,
      controls: repaired.controls,
      ...(repaired.categories.length ? { categories: repaired.categories } : {}),
      expectedRevision: revision,
      ...(panel.assetId ? { panelAssetId: panel.assetId } : {}),
    });
    setSaving(false);
    if (response.ok) {
      setRevision(response.data.revision ?? revision + 1);
      setDirty(false);
      setPanel((current) => ({ ...current, assetId: null }));
      setMessage({ severity: "success", text: t("synths.saved") });
      onSaved();
      return true;
    }
    setMessage({ severity: "error", text: response.status === 409 ? t("synths.conflict") : t("synths.invalid") });
    return false;
  }

  return {
    displayName,
    setDisplayName: (value: string) => change(() => setDisplayName(value)),
    manufacturer,
    setManufacturer: (value: string) => change(() => setManufacturer(value)),
    controls,
    categories,
    issues,
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
    setSwitchStyle,
    remove,
    replacePanel,
    undo,
    redo,
    addCategory,
    renameCategory,
    recolorCategory,
    rescaleCategory,
    moveCategory,
    removeCategory,
    setCategory,
    setSwitchRole,
    setSelectorCategories,
    setDependsOn,
    dirty,
    saving,
    message,
    save,
  };
}

export type SynthDraft = ReturnType<typeof useSynthDraft>;
