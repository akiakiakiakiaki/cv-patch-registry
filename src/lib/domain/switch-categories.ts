import type { ControlCategory, InstrumentLayout, SwitchDefinition } from "@/lib/instrument/layout";

/**
 * Switch states of selectors and dependents are stored per category as `<switchId>::<categoryId>`.
 * Keys use the category ID, not its position, so renaming, recoloring or reordering categories keeps patches intact.
 * Patch data stays a map of booleans.
 */
const SEPARATOR = "::";

export const CATEGORY_ID_PATTERN = /^cat-[a-f0-9]{8}$/;
export const CATEGORY_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

type Switches = readonly SwitchDefinition[];
type SwitchValues = Readonly<Record<string, boolean>>;

export function categoryStateKey(switchId: string, categoryId: string): string {
  return `${switchId}${SEPARATOR}${categoryId}`;
}

export function isSelector(control: SwitchDefinition): boolean {
  return (control.selects?.length ?? 0) > 0;
}

/** The selector a dependent switch follows, if it exists and is a selector. */
export function selectorOf(switches: Switches, control: SwitchDefinition): SwitchDefinition | undefined {
  if (!control.dependsOn) return undefined;
  const parent = switches.find((item) => item.id === control.dependsOn);
  return parent && isSelector(parent) ? parent : undefined;
}

/** The selector's active category: the first one whose key is on, otherwise the first in order. */
export function activeCategoryId(selector: SwitchDefinition, values: SwitchValues): string | undefined {
  const selects = selector.selects ?? [];
  return selects.find((categoryId) => values[categoryStateKey(selector.id, categoryId)] === true) ?? selects[0];
}

/** Every key a patch may store for these switches. */
export function switchStateKeys(switches: Switches): Set<string> {
  const keys = new Set<string>();
  for (const control of switches) {
    const selector = selectorOf(switches, control);
    if (isSelector(control)) {
      for (const categoryId of control.selects ?? []) keys.add(categoryStateKey(control.id, categoryId));
    } else if (selector) {
      for (const categoryId of selector.selects ?? []) keys.add(categoryStateKey(control.id, categoryId));
    } else {
      keys.add(control.id);
    }
  }
  return keys;
}

/**
 * Keeps only keys the switches can use. A selector keeps a single key, the one of its active category,
 * and only when that is not the first category (the first one is the default).
 */
export function restrictSwitchStates(values: SwitchValues, switches: Switches): Record<string, boolean> {
  const allowed = switchStateKeys(switches);
  const selectorKeys = new Set<string>();
  const result: Record<string, boolean> = {};
  for (const control of switches.filter(isSelector)) {
    for (const categoryId of control.selects ?? []) selectorKeys.add(categoryStateKey(control.id, categoryId));
    const active = activeCategoryId(control, values);
    if (active && active !== control.selects?.[0]) result[categoryStateKey(control.id, active)] = true;
  }
  for (const [key, value] of Object.entries(values)) {
    if (allowed.has(key) && !selectorKeys.has(key)) result[key] = value;
  }
  return result;
}

export interface LayoutSwitchState {
  /** Lit or not. A selector is always lit in the color of its active category. */
  active: boolean;
  /** Category whose color the switch shows; undefined means the default color. */
  categoryId: string | undefined;
  stateKey: string;
}

export function layoutSwitchState(switches: Switches, values: SwitchValues, id: string): LayoutSwitchState {
  const control = switches.find((item) => item.id === id);
  if (!control) return { active: values[id] ?? false, categoryId: undefined, stateKey: id };
  if (isSelector(control)) {
    const categoryId = activeCategoryId(control, values);
    return { active: true, categoryId, stateKey: categoryStateKey(id, categoryId ?? "") };
  }
  const selector = selectorOf(switches, control);
  if (selector) {
    const categoryId = activeCategoryId(selector, values);
    const stateKey = categoryStateKey(id, categoryId ?? "");
    return { active: values[stateKey] ?? false, categoryId, stateKey };
  }
  return { active: values[id] ?? false, categoryId: control.category, stateKey: id };
}

/** The changes one click causes. A selector moves to its next category; other switches flip their current state. */
export function toggleLayoutSwitch(switches: Switches, values: SwitchValues, id: string): Record<string, boolean> {
  const control = switches.find((item) => item.id === id);
  if (control && isSelector(control)) {
    const selects = control.selects ?? [];
    const current = activeCategoryId(control, values);
    const next = selects[(selects.indexOf(current ?? "") + 1) % selects.length];
    return Object.fromEntries(selects.map((categoryId) => [categoryStateKey(id, categoryId), categoryId === next]));
  }
  const state = layoutSwitchState(switches, values, id);
  return { [state.stateKey]: !state.active };
}

export type CategoryIssue =
  | { code: "duplicate-category"; categoryId: string }
  | { code: "unknown-category"; controlId: string; categoryId: string }
  | { code: "selector-too-few"; controlId: string }
  | { code: "selector-duplicate"; controlId: string; categoryId: string }
  | { code: "selector-with-parent"; controlId: string }
  | { code: "selector-with-category"; controlId: string }
  | { code: "dependent-with-category"; controlId: string }
  | { code: "parent-missing"; controlId: string; parentId: string }
  | { code: "parent-not-selector"; controlId: string; parentId: string };

/** Problems that make a layout's categories or switch roles inconsistent. Empty when everything fits. */
export function categoryIssues(layout: Pick<InstrumentLayout, "categories" | "knobs" | "switches">): CategoryIssue[] {
  const issues: CategoryIssue[] = [];
  const categories: readonly ControlCategory[] = layout.categories ?? [];
  const known = new Set<string>();
  for (const category of categories) {
    if (known.has(category.id)) issues.push({ code: "duplicate-category", categoryId: category.id });
    known.add(category.id);
  }
  for (const knob of layout.knobs) {
    if (knob.category && !known.has(knob.category)) issues.push({ code: "unknown-category", controlId: knob.id, categoryId: knob.category });
  }
  for (const control of layout.switches) {
    if (control.category && !known.has(control.category)) {
      issues.push({ code: "unknown-category", controlId: control.id, categoryId: control.category });
    }
    if (control.selects) {
      if (control.selects.length < 2) issues.push({ code: "selector-too-few", controlId: control.id });
      const seen = new Set<string>();
      for (const categoryId of control.selects) {
        if (!known.has(categoryId)) issues.push({ code: "unknown-category", controlId: control.id, categoryId });
        if (seen.has(categoryId)) issues.push({ code: "selector-duplicate", controlId: control.id, categoryId });
        seen.add(categoryId);
      }
      if (control.dependsOn) issues.push({ code: "selector-with-parent", controlId: control.id });
      if (control.category) issues.push({ code: "selector-with-category", controlId: control.id });
    }
    if (control.dependsOn) {
      const parent = layout.switches.find((item) => item.id === control.dependsOn);
      if (!parent) issues.push({ code: "parent-missing", controlId: control.id, parentId: control.dependsOn });
      else if (!parent.selects || parent.dependsOn) issues.push({ code: "parent-not-selector", controlId: control.id, parentId: control.dependsOn });
      if (control.category) issues.push({ code: "dependent-with-category", controlId: control.id });
    }
  }
  return issues;
}

/** Whether the layout uses categories or switch roles, which need layout schema minor 2. */
export function usesCategories(layout: Pick<InstrumentLayout, "categories" | "knobs" | "switches">): boolean {
  return (
    (layout.categories?.length ?? 0) > 0 ||
    layout.knobs.some((knob) => knob.category !== undefined) ||
    layout.switches.some((control) => control.category !== undefined || control.selects !== undefined || control.dependsOn !== undefined)
  );
}
