import { afterEach, describe, expect, it } from "vitest";
import { sheetModeLayout } from "@/components/patch-sheet/sheet-mode";
import { confirmLeave, setLeaveGuard } from "@/lib/navigation/leave-guard";

describe("sheetModeLayout", () => {
  it("shows the patch parts while patching and fills the window while editing a synth", () => {
    expect(sheetModeLayout("patching")).toEqual({ patchRow: true, patchActions: true, fillWindow: false });
    expect(sheetModeLayout("editingSynth")).toEqual({ patchRow: false, patchActions: false, fillWindow: true });
  });
});

describe("leave guard", () => {
  let remove: () => void = () => {};
  afterEach(() => remove());

  it("lets leave without a guard and asks the registered one otherwise", async () => {
    expect(await confirmLeave()).toBe(true);
    remove = setLeaveGuard(async () => false);
    expect(await confirmLeave()).toBe(false);
    remove();
    expect(await confirmLeave()).toBe(true);
  });

  it("removes only its own guard", async () => {
    const removeFirst = setLeaveGuard(async () => false);
    remove = setLeaveGuard(async () => true);
    removeFirst();
    expect(await confirmLeave()).toBe(true);
  });
});
