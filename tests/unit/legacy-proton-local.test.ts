import { afterEach, describe, expect, it } from "vitest";
import {
  CLONE_SHIFT_CATEGORY,
  PROTON_CLONE_SLUG,
  buildProtonCloneLayout,
  cloneControlId,
  decodeLegacyProtonExportForClone,
  isLegacyProtonExport,
  migrateLegacyLibrary,
} from "@/lib/adapters/proton-legacy-migration-adapter";
import { encodeLibrary } from "@/lib/adapters/patch-adapter";
import { categoryStateKey } from "@/lib/domain/switch-categories";
import type { PatchLibrary } from "@/lib/domain/types";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import { instrumentFromSynth } from "@/lib/instruments/from-synth";
import { loadLocalLibrary } from "@/lib/storage/legacy-proton-local";
import { LocalPatchRepository } from "@/lib/storage/local-patch-repository";

const clone = instrumentFromSynth({ slug: PROTON_CLONE_SLUG, displayName: "Behringer Proton", panelUrl: "/x.png", layout: buildProtonCloneLayout() });
const legacyLibrary: PatchLibrary = {
  activeId: "p2",
  patches: [
    { id: "p1", name: "Bass", updatedAt: "2026-01-01T00:00:00.000Z", data: { knobs: { "Tune 1": 100 }, switches: { "Loop::blue": true, "Shift::blue": true }, leds: {}, cables: [] } },
    { id: "p2", name: "Lead", updatedAt: "2026-01-02T00:00:00.000Z", data: { knobs: { "Tune 2": 7 }, switches: {}, leds: {}, cables: [] } },
  ],
};

afterEach(() => window.localStorage.clear());

function storeLegacy() {
  new LocalPatchRepository(behringerProton).saveCurrent(legacyLibrary);
}

describe("migrateLegacyLibrary", () => {
  it("keeps IDs, names, timestamps and the active patch and migrates the data", () => {
    const migrated = migrateLegacyLibrary(legacyLibrary);
    expect(migrated.activeId).toBe("p2");
    expect(migrated.patches.map((patch) => [patch.id, patch.name, patch.updatedAt])).toEqual(legacyLibrary.patches.map((patch) => [patch.id, patch.name, patch.updatedAt]));
    expect(migrated.patches[0]!.data.knobs).toEqual({ [cloneControlId("knob", "Tune 1")]: 100 });
  });
});

describe("legacy Proton exports", () => {
  it("are recognized in every Proton format, but not exports of other synths", () => {
    expect(isLegacyProtonExport(encodeLibrary(legacyLibrary, behringerProton.id))).toBe(true);
    expect(isLegacyProtonExport({ format: "proton-patch-library", patches: [] })).toBe(true);
    expect(isLegacyProtonExport({ patches: [] })).toBe(true);
    expect(isLegacyProtonExport(encodeLibrary(legacyLibrary, "td3"))).toBe(false);
    expect(isLegacyProtonExport(encodeLibrary(legacyLibrary, PROTON_CLONE_SLUG))).toBe(false);
    expect(isLegacyProtonExport([])).toBe(false);
  });

  it("are read for the clone with migrated data, matched by name instead of ID", () => {
    const decoded = decodeLegacyProtonExportForClone(encodeLibrary(legacyLibrary, behringerProton.id));
    expect(decoded.hasStableIds).toBe(false);
    expect(decoded.patches.map((patch) => patch.name)).toEqual(["Bass", "Lead"]);
    expect(decoded.patches[0]!.data.switches).toEqual({
      [categoryStateKey(cloneControlId("switch", "Loop"), CLONE_SHIFT_CATEGORY.id)]: true,
      [categoryStateKey(cloneControlId("switch", "Shift"), CLONE_SHIFT_CATEGORY.id)]: true,
    });
  });
});

describe("loadLocalLibrary for the clone", () => {
  it("migrates this browser's legacy library once and keeps the legacy one", () => {
    storeLegacy();
    const repository = new LocalPatchRepository(clone);
    const first = loadLocalLibrary(repository, PROTON_CLONE_SLUG, "New patch");
    expect(first.patches.map((patch) => patch.name)).toEqual(["Bass", "Lead"]);
    expect(first.patches[0]!.data.knobs).toEqual({ [cloneControlId("knob", "Tune 1")]: 100 });

    // Loading again reads the clone's own library; knob values are not converted a second time.
    expect(loadLocalLibrary(repository, PROTON_CLONE_SLUG, "New patch").patches[0]!.data.knobs).toEqual({ [cloneControlId("knob", "Tune 1")]: 100 });
    expect(new LocalPatchRepository(behringerProton).load().patches[0]!.data.knobs).toEqual({ "Tune 1": 100 });
  });

  it("never overwrites a library the clone already has", () => {
    storeLegacy();
    const repository = new LocalPatchRepository(clone);
    const own: PatchLibrary = { activeId: "c1", patches: [{ id: "c1", name: "Own", updatedAt: "2026-01-03T00:00:00.000Z", data: { knobs: {}, switches: {}, leds: {}, cables: [] } }] };
    repository.saveCurrent(own);
    expect(loadLocalLibrary(repository, PROTON_CLONE_SLUG, "New patch").patches.map((patch) => patch.name)).toEqual(["Own"]);
  });

  it("starts empty without a legacy library, and leaves other synths alone", () => {
    expect(loadLocalLibrary(new LocalPatchRepository(clone), PROTON_CLONE_SLUG, "New patch").patches.map((patch) => patch.name)).toEqual(["New patch"]);
    storeLegacy();
    const td3 = instrumentFromSynth({ slug: "td3", displayName: "TD3", panelUrl: "/x.png", layout: { ...buildProtonCloneLayout(), id: "td3" } });
    expect(loadLocalLibrary(new LocalPatchRepository(td3), "td3", "New patch").patches.map((patch) => patch.name)).toEqual(["New patch"]);
  });
});
