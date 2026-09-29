import { describe, expect, it } from "vitest";
import type { PatchLibrary, PatchRecord } from "@/lib/domain/types";
import {
  activatePatch,
  addPatch,
  mergePatchLibrary,
  patchContentDiffers,
  removePatch,
  updateKnob,
  updateLed,
  updatePatch,
  updateSwitch,
} from "@/lib/domain/patch-service";

const firstPatch: PatchRecord = {
  id: "patch-1",
  name: "Init",
  updatedAt: "2026-01-01T00:00:00.000Z",
  data: { knobs: {}, switches: {}, leds: {}, cables: [] },
};
const secondPatch: PatchRecord = {
  ...firstPatch,
  id: "patch-2",
  name: "Bass",
};
const library: PatchLibrary = {
  activeId: firstPatch.id,
  patches: [firstPatch, secondPatch],
};

describe("patch service", () => {
  it("creates a new active patch without changing the existing library", () => {
    const result = addPatch(library, new Date("2026-02-01T00:00:00.000Z"), "Lead");

    expect(result.patches).toHaveLength(3);
    expect(result.patches[0]).toBe(firstPatch);
    expect(result.activeId).toBe(result.patches[2]?.id);
    expect(result.patches[2]).toMatchObject({
      name: "Lead",
      updatedAt: "2026-02-01T00:00:00.000Z",
      data: { knobs: {}, switches: {}, leds: {}, cables: [] },
    });
  });

  it("activates only a patch that exists", () => {
    expect(activatePatch(library, secondPatch.id).activeId).toBe(secondPatch.id);
    expect(activatePatch(library, "missing")).toBe(library);
  });

  it("updates patch data immutably and refreshes its timestamp", () => {
    const now = new Date("2026-02-02T00:00:00.000Z");
    const renamed = updatePatch(library, firstPatch.id, { name: "Warm" }, now);
    const knobbed = updateKnob(renamed, firstPatch.id, "Freq", 75, now);
    const switched = updateSwitch(knobbed, firstPatch.id, "Sync", true, now);
    const led = updateLed(switched, firstPatch.id, "Wave A", true, now);

    expect(led.patches[0]).toMatchObject({
      name: "Warm",
      updatedAt: now.toISOString(),
      data: {
        knobs: { Freq: 75 },
        switches: { Sync: true },
        leds: { "Wave A": true },
      },
    });
    expect(firstPatch.data).toEqual({ knobs: {}, switches: {}, leds: {}, cables: [] });
    expect(updateKnob(library, "missing", "Freq", 1)).toBe(library);
  });

  it("keeps knob values within the integer MIDI range", () => {
    expect(updateKnob(library, firstPatch.id, "Freq", -1).patches[0]?.data.knobs.Freq).toBe(0);
    expect(updateKnob(library, firstPatch.id, "Freq", 128).patches[0]?.data.knobs.Freq).toBe(127);
    expect(updateKnob(library, firstPatch.id, "Freq", 63.6).patches[0]?.data.knobs.Freq).toBe(64);
  });

  it("removes a non-active patch and selects another when removing the active one", () => {
    expect(removePatch(library, secondPatch.id).activeId).toBe(firstPatch.id);
    expect(removePatch(library, firstPatch.id).activeId).toBe(secondPatch.id);
  });

  it("creates a replacement patch when deleting the last patch", () => {
    const onlyPatch = { activeId: firstPatch.id, patches: [firstPatch] };
    const result = removePatch(
      onlyPatch,
      firstPatch.id,
      new Date("2026-03-01T00:00:00.000Z"),
      "Fresh patch",
    );

    expect(result.patches).toHaveLength(1);
    expect(result.activeId).toBe(result.patches[0]?.id);
    expect(result.patches[0]).toMatchObject({
      name: "Fresh patch",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
  });

  it("detects content changes without considering timestamps", () => {
    expect(patchContentDiffers(firstPatch, { ...firstPatch, updatedAt: "later" })).toBe(false);
    expect(patchContentDiffers(firstPatch, { ...firstPatch, name: "Changed" })).toBe(true);
  });

  it("merges new patches and resolves changed patches according to the import choice", () => {
    const incomingNew = { ...secondPatch, id: "patch-3", name: "Pad" };
    const incomingChanged = { ...firstPatch, name: "Imported Init" };
    const localChoice = mergePatchLibrary(library, [incomingNew, incomingChanged], {
      [firstPatch.id]: "local",
    });
    const incomingChoice = mergePatchLibrary(library, [incomingNew, incomingChanged], {
      [firstPatch.id]: "incoming",
    });

    expect(localChoice.patches.map((patch) => patch.id)).toEqual([
      "patch-1",
      "patch-2",
      "patch-3",
    ]);
    expect(localChoice.patches[0]?.name).toBe("Init");
    expect(incomingChoice.patches[0]?.name).toBe("Imported Init");
    expect(localChoice.activeId).toBe(library.activeId);
  });

  it("uses a newer timestamp for identical content and keeps the local patch for unresolved conflicts", () => {
    const newerSame = { ...firstPatch, updatedAt: "2027-01-01T00:00:00.000Z" };
    const changed = { ...firstPatch, name: "Changed" };
    expect(mergePatchLibrary(library, [newerSame], {}).patches[0]?.updatedAt).toBe(
      newerSame.updatedAt,
    );
    expect(mergePatchLibrary(library, [changed], {}).patches[0]).toBe(firstPatch);
  });
});
