import { describe, expect, it } from "vitest";
import {
  activeCategoryId,
  categoryIssues,
  categoryStateKey,
  layoutSwitchState,
  restrictSwitchStates,
  switchStateKeys,
  toggleLayoutSwitch,
  usesCategories,
} from "@/lib/domain/switch-categories";
import type { SwitchDefinition } from "@/lib/instrument/layout";
import { testLayout } from "../fixtures/instrument";
import { DEPENDENT, KNOB, NORMAL, PLAIN, SELECTOR, SHIFT, THIRD, categoryLayout } from "../fixtures/categories";

const switches = categoryLayout.switches;
const key = categoryStateKey;

describe("switch state keys", () => {
  it("stores selectors and dependents per category, plain switches under their ID", () => {
    expect([...switchStateKeys(switches)].sort()).toEqual(
      [key(SELECTOR, NORMAL), key(SELECTOR, SHIFT), key(SELECTOR, THIRD), key(DEPENDENT, NORMAL), key(DEPENDENT, SHIFT), key(DEPENDENT, THIRD), PLAIN].sort(),
    );
  });

  it("treats a dependent of a missing or non-selector parent as a plain switch", () => {
    const orphan: SwitchDefinition[] = [{ id: "a", x: 0, y: 0, dependsOn: "missing" }];
    expect([...switchStateKeys(orphan)]).toEqual(["a"]);
  });
});

describe("selector", () => {
  it("starts on its first category and cycles through all of them in order", () => {
    let values: Record<string, boolean> = {};
    expect(activeCategoryId(switches[0]!, values)).toBe(NORMAL);
    for (const expected of [SHIFT, THIRD, NORMAL]) {
      values = { ...values, ...toggleLayoutSwitch(switches, values, SELECTOR) };
      expect(activeCategoryId(switches[0]!, values)).toBe(expected);
    }
  });

  it("is always lit in the color of its active category", () => {
    expect(layoutSwitchState(switches, { [key(SELECTOR, THIRD)]: true }, SELECTOR)).toMatchObject({ active: true, categoryId: THIRD });
  });
});

describe("dependent switch", () => {
  it("keeps one state per category of its selector and shows the active one", () => {
    let values: Record<string, boolean> = {};
    values = { ...values, ...toggleLayoutSwitch(switches, values, DEPENDENT) };
    expect(values).toEqual({ [key(DEPENDENT, NORMAL)]: true });

    values = { ...values, ...toggleLayoutSwitch(switches, values, SELECTOR) };
    expect(layoutSwitchState(switches, values, DEPENDENT)).toEqual({ active: false, categoryId: SHIFT, stateKey: key(DEPENDENT, SHIFT) });

    values = { ...values, ...toggleLayoutSwitch(switches, values, DEPENDENT) };
    expect(values[key(DEPENDENT, SHIFT)]).toBe(true);
    expect(values[key(DEPENDENT, NORMAL)]).toBe(true);
  });
});

describe("plain switch", () => {
  it("shows its own category color and flips its single state", () => {
    expect(layoutSwitchState(switches, {}, PLAIN)).toEqual({ active: false, categoryId: THIRD, stateKey: PLAIN });
    expect(toggleLayoutSwitch(switches, {}, PLAIN)).toEqual({ [PLAIN]: true });
  });
});

describe("restrictSwitchStates", () => {
  it("drops unknown keys and keeps a single selector key, none for the first category", () => {
    const values = {
      [key(SELECTOR, NORMAL)]: false,
      [key(SELECTOR, SHIFT)]: true,
      [key(SELECTOR, THIRD)]: true,
      [key(DEPENDENT, SHIFT)]: true,
      [DEPENDENT]: true,
      [PLAIN]: false,
      Ghost: true,
    };
    expect(restrictSwitchStates(values, switches)).toEqual({ [key(SELECTOR, SHIFT)]: true, [key(DEPENDENT, SHIFT)]: true, [PLAIN]: false });
    expect(restrictSwitchStates({ [key(SELECTOR, NORMAL)]: true }, switches)).toEqual({});
  });

  it("leaves layouts without roles unchanged", () => {
    expect(restrictSwitchStates({ "Test switch": true, "Other::blue": true }, testLayout.switches)).toEqual({ "Test switch": true });
  });
});

describe("categoryIssues", () => {
  const issues = (overrides: Partial<typeof categoryLayout>) => categoryIssues({ ...categoryLayout, ...overrides }).map((issue) => issue.code);

  it("accepts a consistent configuration", () => {
    expect(categoryIssues(categoryLayout)).toEqual([]);
  });

  it("needs at least two distinct, known categories on a selector", () => {
    expect(issues({ switches: [{ ...switches[0]!, selects: [NORMAL] }] })).toContain("selector-too-few");
    expect(issues({ switches: [{ ...switches[0]!, selects: [NORMAL, NORMAL] }] })).toContain("selector-duplicate");
    expect(issues({ switches: [{ ...switches[0]!, selects: [NORMAL, "cat-ffffffff"] }] })).toContain("unknown-category");
  });

  it("forbids a dependent as parent and a parent that depends on another switch", () => {
    const chained: SwitchDefinition[] = [...switches, { id: "switch-00000004", x: 1, y: 1, dependsOn: DEPENDENT }];
    expect(issues({ switches: chained })).toContain("parent-not-selector");
    const selectorWithParent: SwitchDefinition[] = [
      switches[0]!,
      { id: "switch-00000005", x: 1, y: 1, selects: [NORMAL, SHIFT], dependsOn: SELECTOR },
    ];
    expect(issues({ switches: selectorWithParent })).toContain("selector-with-parent");
  });

  it("reports missing parents, unknown and duplicate categories, and fixed colors on role switches", () => {
    expect(issues({ switches: [{ id: "a", x: 1, y: 1, dependsOn: "gone" }] })).toContain("parent-missing");
    expect(issues({ knobs: [{ id: KNOB, x: 1, y: 1, category: "cat-ffffffff" }] })).toContain("unknown-category");
    expect(issues({ categories: [...categoryLayout.categories!, { id: NORMAL, name: "Again", color: "#000000" }] })).toContain("duplicate-category");
    expect(issues({ switches: [{ ...switches[0]!, category: NORMAL }, switches[1]!] })).toContain("selector-with-category");
    expect(issues({ switches: [switches[0]!, { ...switches[1]!, category: NORMAL }] })).toContain("dependent-with-category");
  });
});

describe("usesCategories", () => {
  it("is false for layouts without categories or roles", () => {
    expect(usesCategories(testLayout)).toBe(false);
    expect(usesCategories(categoryLayout)).toBe(true);
  });
});

describe("LED categories in checks", () => {
  it("report unknown categories on LEDs and count as category use", () => {
    const led = { id: "led-00000001", x: 1, y: 1, color: "red" as const, category: "cat-ffffffff" };
    expect(categoryIssues({ ...categoryLayout, leds: [led] })).toEqual([{ code: "unknown-category", controlId: led.id, categoryId: "cat-ffffffff" }]);
    expect(usesCategories({ ...testLayout, leds: [{ ...led, category: SHIFT }] })).toBe(true);
  });
});

