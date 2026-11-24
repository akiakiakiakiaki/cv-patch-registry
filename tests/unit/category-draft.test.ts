import { describe, expect, it } from "vitest";
import {
  categoryUsage,
  draftCategoryIssues,
  fixedColorOf,
  generateCategoryId,
  moveItem,
  nextCategoryColor,
  recolorCategory,
  removeCategory,
  repairCategoryRoles,
  setControlCategory,
  setDependsOn,
  setSwitchRole,
  shownCategoryIds,
  switchRole,
} from "@/components/synth-editor/category-draft";
import type { EditorControl } from "@/components/synth-editor/draft-state";
import { CATEGORY_ID_PATTERN } from "@/lib/domain/switch-categories";
import { NORMAL, SHIFT, THIRD, categoryLayout } from "../fixtures/categories";

const categories = [...categoryLayout.categories!];
const sw = (id: string, extra: Partial<EditorControl> = {}): EditorControl => ({ id, kind: "switch", label: id, x: 1, y: 1, ...extra });
const knob: EditorControl = { id: "knob-00000001", kind: "knob", label: "Cutoff", x: 1, y: 1, category: SHIFT };

describe("categories", () => {
  it("get valid IDs and the next palette color", () => {
    expect(generateCategoryId()).toMatch(CATEGORY_ID_PATTERN);
    expect(nextCategoryColor([])).toBe("#e53935");
    expect(nextCategoryColor(categories)).toBe("#fb8c00");
  });

  it("store colors lowercase and ignore invalid ones", () => {
    expect(recolorCategory(categories, NORMAL, "#ABCDEF")[0]!.color).toBe("#abcdef");
    expect(recolorCategory(categories, NORMAL, "red")[0]!.color).toBe("#e53935");
  });

  it("move one step and stay in range", () => {
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });

  it("are removed together with every reference to them", () => {
    const controls = [knob, sw("s1", { selects: [NORMAL, SHIFT, THIRD] }), sw("s2", { category: SHIFT })];
    expect(categoryUsage(controls, SHIFT)).toBe(3);
    const next = removeCategory(categories, controls, SHIFT);
    expect(next.categories.map((category) => category.id)).toEqual([NORMAL, THIRD]);
    expect(next.controls).toEqual([
      { id: "knob-00000001", kind: "knob", label: "Cutoff", x: 1, y: 1 },
      sw("s1", { selects: [NORMAL, THIRD] }),
      sw("s2"),
    ]);
  });
});

describe("switch roles", () => {
  it("start a selector with the first two categories and drop a fixed color", () => {
    const [selector] = setSwitchRole([sw("s1", { category: THIRD })], categories, "s1", "selector");
    expect(selector).toEqual(sw("s1", { selects: [NORMAL, SHIFT] }));
    expect(switchRole(selector!)).toBe("selector");
  });

  it("let a new dependent follow the first other selector", () => {
    const controls = [sw("parent", { selects: [NORMAL, SHIFT] }), sw("child", { category: NORMAL })];
    expect(setSwitchRole(controls, categories, "child", "dependent")[1]).toEqual(sw("child", { dependsOn: "parent" }));
    expect(setDependsOn(controls, "child", "parent")[1]).toEqual(sw("child", { dependsOn: "parent" }));
  });

  it("keep the color category when going back to a plain switch", () => {
    expect(setSwitchRole([sw("s1", { category: THIRD })], categories, "s1", "plain")[0]).toEqual(sw("s1", { category: THIRD }));
    expect(setSwitchRole([sw("s1", { dependsOn: "x" })], categories, "s1", "plain")[0]).toEqual(sw("s1"));
  });

  it("set and clear a control's category", () => {
    expect(setControlCategory([knob], knob.id, undefined)[0]).not.toHaveProperty("category");
    expect(setControlCategory([knob], knob.id, THIRD)[0]).toMatchObject({ category: THIRD });
  });
});

describe("repairCategoryRoles", () => {
  it("removes what does not fit and leaves a consistent configuration", () => {
    const controls: EditorControl[] = [
      { ...knob, category: "cat-ffffffff" },
      sw("lonely", { selects: [NORMAL, NORMAL, "cat-ffffffff"] }),
      sw("selector", { selects: [NORMAL, SHIFT], dependsOn: "lonely", category: THIRD }),
      sw("child", { dependsOn: "selector", category: NORMAL }),
      sw("orphan", { dependsOn: "lonely" }),
      sw("gone", { dependsOn: "missing" }),
    ];
    expect(draftCategoryIssues(categories, controls).length).toBeGreaterThan(0);
    const repaired = repairCategoryRoles([...categories, categories[0]!], controls);
    expect(repaired.categories).toEqual(categories);
    expect(repaired.controls).toEqual([
      { id: "knob-00000001", kind: "knob", label: "Cutoff", x: 1, y: 1 },
      sw("lonely"),
      sw("selector", { selects: [NORMAL, SHIFT] }),
      sw("child", { dependsOn: "selector" }),
      sw("orphan"),
      sw("gone"),
    ]);
    expect(draftCategoryIssues(repaired.categories, repaired.controls)).toEqual([]);
  });

  it("leaves a consistent configuration unchanged", () => {
    const controls = [knob, sw("selector", { selects: [NORMAL, SHIFT, THIRD] }), sw("child", { dependsOn: "selector" })];
    expect(repairCategoryRoles(categories, controls)).toEqual({ categories, controls });
  });
});

describe("shownCategoryIds", () => {
  const controls = [knob, sw("selector", { selects: [NORMAL, SHIFT, THIRD] }), sw("child", { dependsOn: "selector" }), sw("plain")];

  it("lists a control's own category, a selector's categories, and its dependents' selector categories", () => {
    expect(shownCategoryIds(knob, controls)).toEqual([SHIFT]);
    expect(shownCategoryIds(controls[1]!, controls)).toEqual([NORMAL, SHIFT, THIRD]);
    expect(shownCategoryIds(controls[2]!, controls)).toEqual([NORMAL, SHIFT, THIRD]);
    expect(shownCategoryIds(controls[3]!, controls)).toEqual([]);
  });
});

describe("LED categories in the editor", () => {
  const led: EditorControl = { id: "led-00000001", kind: "led", label: "Gate", x: 1, y: 1, color: "blue", category: "cat-ffffffff" };

  it("are checked and repaired like other controls", () => {
    expect(draftCategoryIssues(categories, [led]).map((issue) => issue.code)).toEqual(["unknown-category"]);
    expect(repairCategoryRoles(categories, [led]).controls).toEqual([{ id: "led-00000001", kind: "led", label: "Gate", x: 1, y: 1, color: "blue" }]);
  });
});

describe("fixedColorOf", () => {
  it("gives LEDs their fixed color and plain switches the default switch color", () => {
    const led = (color: "red" | "blue" | "amber"): EditorControl => ({ id: "led", kind: "led", label: "L", x: 1, y: 1, color });
    expect(fixedColorOf(led("amber"))).toBe("var(--color-led-blue)");
    expect(fixedColorOf(led("blue"))).toBe("var(--color-led-blue)");
    expect(fixedColorOf(sw("plain"))).toBe("var(--color-switch-stroke)");
  });

  it("leaves categorized and role switches to their category dots, and knobs without a dot", () => {
    expect(fixedColorOf(sw("s", { category: NORMAL }))).toBeUndefined();
    expect(fixedColorOf(sw("s", { selects: [NORMAL, SHIFT] }))).toBeUndefined();
    expect(fixedColorOf(sw("s", { dependsOn: "x" }))).toBeUndefined();
    expect(fixedColorOf({ id: "led", kind: "led", label: "L", x: 1, y: 1, color: "red", category: NORMAL })).toBeUndefined();
    expect(fixedColorOf({ ...knob, category: undefined })).toBeUndefined();
  });
});

