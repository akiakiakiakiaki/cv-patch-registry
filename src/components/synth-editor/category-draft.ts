import type { EditorControl } from "@/components/synth-editor/draft-state";
import { CATEGORY_COLOR_PATTERN, categoryIssues, type CategoryIssue } from "@/lib/domain/switch-categories";
import type { ControlCategory } from "@/lib/instrument/layout";

/** Colors offered for new categories, in turn. The user can change them with the color picker. */
const CATEGORY_PALETTE = ["#e53935", "#1e88e5", "#43a047", "#fb8c00", "#8e24aa", "#00897b"] as const;

export type SwitchRole = "plain" | "selector" | "dependent";

export function generateCategoryId(): string {
  return `cat-${crypto.randomUUID().slice(0, 8)}`;
}

export function nextCategoryColor(categories: readonly ControlCategory[]): string {
  return CATEGORY_PALETTE[categories.length % CATEGORY_PALETTE.length]!;
}

export function switchRole(control: EditorControl): SwitchRole {
  if (control.selects) return "selector";
  if (control.dependsOn) return "dependent";
  return "plain";
}

/** Without category, selector list or parent: the plain control. */
function withoutRole(control: EditorControl): EditorControl {
  const { category: _category, selects: _selects, dependsOn: _dependsOn, ...rest } = control;
  return rest;
}

function updateById(controls: readonly EditorControl[], id: string, apply: (control: EditorControl) => EditorControl): EditorControl[] {
  return controls.map((control) => (control.id === id ? apply(control) : control));
}

export function addCategory(categories: readonly ControlCategory[], category: ControlCategory): ControlCategory[] {
  return [...categories, category];
}

export function renameCategory(categories: readonly ControlCategory[], id: string, name: string): ControlCategory[] {
  return categories.map((category) => (category.id === id ? { ...category, name } : category));
}

/** Colors are stored lowercase as `#rrggbb`; anything else is ignored. */
export function recolorCategory(categories: readonly ControlCategory[], id: string, color: string): ControlCategory[] {
  const normalized = color.toLowerCase();
  if (!CATEGORY_COLOR_PATTERN.test(normalized)) return [...categories];
  return categories.map((category) => (category.id === id ? { ...category, color: normalized } : category));
}

/** Moves an item one step up (-1) or down (+1); out-of-range moves leave the order unchanged. */
export function moveItem<T>(items: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= items.length) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** How many controls refer to a category (as color or in a selector). */
export function categoryUsage(controls: readonly EditorControl[], id: string): number {
  return controls.filter((control) => control.category === id || control.selects?.includes(id)).length;
}

/** Removes a category and every reference to it. A selector may end up with too few categories; saving reports that. */
export function removeCategory(
  categories: readonly ControlCategory[],
  controls: readonly EditorControl[],
  id: string,
): { categories: ControlCategory[]; controls: EditorControl[] } {
  return {
    categories: categories.filter((category) => category.id !== id),
    controls: controls.map((control) => {
      let next = control;
      if (next.category === id) {
        const { category: _category, ...rest } = next;
        next = rest;
      }
      if (next.selects?.includes(id)) next = { ...next, selects: next.selects.filter((categoryId) => categoryId !== id) };
      return next;
    }),
  };
}

export function setControlCategory(controls: readonly EditorControl[], id: string, categoryId: string | undefined): EditorControl[] {
  return updateById(controls, id, (control) => {
    const { category: _category, ...rest } = control;
    return categoryId ? { ...rest, category: categoryId } : rest;
  });
}

/**
 * Changes what a switch does. A new selector starts with the first two categories, a new dependent follows
 * the first other selector. Roles exclude each other, so a switch never is selector and dependent at once.
 */
export function setSwitchRole(
  controls: readonly EditorControl[],
  categories: readonly ControlCategory[],
  id: string,
  role: SwitchRole,
): EditorControl[] {
  return updateById(controls, id, (control) => {
    const plain = withoutRole(control);
    if (role === "selector") return { ...plain, selects: categories.slice(0, 2).map((category) => category.id) };
    if (role === "dependent") {
      const parent = controls.find((item) => item.id !== id && item.kind === "switch" && item.selects);
      return parent ? { ...plain, dependsOn: parent.id } : plain;
    }
    return control.category ? { ...plain, category: control.category } : plain;
  });
}

export function setSelectorCategories(controls: readonly EditorControl[], id: string, selects: readonly string[]): EditorControl[] {
  return updateById(controls, id, (control) => ({ ...control, selects: [...selects] }));
}

export function setDependsOn(controls: readonly EditorControl[], id: string, parentId: string): EditorControl[] {
  return updateById(controls, id, (control) => ({ ...withoutRole(control), dependsOn: parentId }));
}

/** Switches that follow the given selector. */
export function dependentsOf(controls: readonly EditorControl[], selectorId: string): EditorControl[] {
  return controls.filter((control) => control.dependsOn === selectorId);
}

/** The same checks the server runs on save, applied to the editor's flat control list. */
export function draftCategoryIssues(categories: readonly ControlCategory[], controls: readonly EditorControl[]): CategoryIssue[] {
  return categoryIssues({
    categories,
    knobs: controls.filter((control) => control.kind === "knob"),
    switches: controls.filter((control) => control.kind === "switch"),
    leds: controls.filter((control) => control.kind === "led").map((control) => ({ ...control, color: control.color ?? "red" })),
  });
}

/**
 * Makes the configuration consistent by removing what does not fit, never by inventing settings:
 * unknown or repeated categories, fixed colors on selectors and dependents, selectors with fewer than
 * two categories (they become plain switches), and dependents without a valid selector (they become plain).
 */
export function repairCategoryRoles(
  categories: readonly ControlCategory[],
  controls: readonly EditorControl[],
): { categories: ControlCategory[]; controls: EditorControl[] } {
  const seen = new Set<string>();
  const uniqueCategories = categories.filter((category) => (seen.has(category.id) ? false : (seen.add(category.id), true)));
  const known = new Set(uniqueCategories.map((category) => category.id));

  let next = controls.map((control) => {
    let fixed: EditorControl = control;
    if (fixed.category && (!known.has(fixed.category) || fixed.selects || fixed.dependsOn)) {
      const { category: _category, ...rest } = fixed;
      fixed = rest;
    }
    if (fixed.selects) {
      const selects = [...new Set(fixed.selects.filter((categoryId) => known.has(categoryId)))];
      const { selects: _selects, dependsOn: _dependsOn, ...rest } = fixed;
      fixed = selects.length >= 2 ? { ...rest, selects } : rest;
    }
    return fixed;
  });
  const selectors = new Set(next.filter((control) => control.kind === "switch" && control.selects).map((control) => control.id));
  next = next.map((control) => {
    if (!control.dependsOn || selectors.has(control.dependsOn)) return control;
    const { dependsOn: _dependsOn, ...rest } = control;
    return rest;
  });
  return { categories: uniqueCategories, controls: next };
}

/**
 * Categories a control shows, for the editor's control list: its own color category, the categories a selector
 * cycles through, or those of a dependent switch's selector.
 */
export function shownCategoryIds(control: EditorControl, controls: readonly EditorControl[]): readonly string[] {
  if (control.category) return [control.category];
  if (control.selects) return control.selects;
  if (control.dependsOn) return controls.find((item) => item.id === control.dependsOn)?.selects ?? [];
  return [];
}

/**
 * The color a control shows without a category, as the panel's CSS variable: knobs their default tick color,
 * LEDs their fixed color, plain switches the default switch color. Undefined where the list shows category dots
 * instead, or no color applies (ports).
 */
export function fixedColorOf(control: EditorControl): string | undefined {
  if (control.category || control.selects || control.dependsOn) return undefined;
  // Same rule as the panel: red LEDs are drawn red, all others blue.
  if (control.kind === "led") return (control.color ?? "red") === "red" ? "var(--color-led-red)" : "var(--color-led-blue)";
  if (control.kind === "switch") return "var(--color-switch-stroke)";
  if (control.kind === "knob") return "var(--color-knob-tick)";
  return undefined;
}

