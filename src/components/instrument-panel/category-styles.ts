import { CATEGORY_COLOR_PATTERN, CATEGORY_ID_PATTERN } from "@/lib/domain/switch-categories";
import type { ControlCategory } from "@/lib/instrument/layout";

/** Class a control gets for its color category. The category ID is already a valid class name. */
export function categoryClass(categoryId: string | undefined): string {
  return categoryId && CATEGORY_ID_PATTERN.test(categoryId) ? categoryId : "";
}

/**
 * One rule per category, scoped to one panel: `[data-category-scope="…"] .cat-… { --category-color: #… }`.
 * Controls only carry the class, so changing a category's color recolors all of them.
 * IDs and colors are checked against their patterns, so layout data cannot inject CSS.
 */
export function categoryStyleSheet(scope: string, categories: readonly ControlCategory[] | undefined): string {
  const safeScope = scope.replace(/[^a-zA-Z0-9_-]/g, "");
  return (categories ?? [])
    .filter((category) => CATEGORY_ID_PATTERN.test(category.id) && CATEGORY_COLOR_PATTERN.test(category.color))
    .map((category) => `[data-category-scope="${safeScope}"] .${category.id}{--category-color:${category.color}}`)
    .join("\n");
}
