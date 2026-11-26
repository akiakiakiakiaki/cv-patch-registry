import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROTON_CLONE_SLUG, buildProtonCloneLayout, cloneControlId } from "@/lib/adapters/proton-legacy-migration-adapter";
import { hasGuestContent } from "@/lib/domain/patch-service";
import type { PatchLibrary } from "@/lib/domain/types";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import { instrumentFromSynth } from "@/lib/instruments/from-synth";
import {
  clearGuestTransferPending,
  guestTransferPendingFor,
  markGuestTransferPending,
  transferGuestPatches,
  type GuestTransferDeps,
} from "@/lib/storage/guest-transfer";
import { LocalPatchRepository } from "@/lib/storage/local-patch-repository";
import { testLayout } from "../fixtures/instrument";

const empty = { knobs: {}, switches: {}, leds: {}, cables: [] };
const patch = (id: string, name: string, data: PatchLibrary["patches"][number]["data"] = empty) => ({ id, name, updatedAt: "2026-01-01T00:00:00.000Z", data });
const library = (...patches: PatchLibrary["patches"]): PatchLibrary => ({ activeId: patches[0]!.id, patches });

const synths: Record<string, { slug: string; displayName: string; panelUrl: string; layout: typeof testLayout }> = {
  td3: { slug: "td3", displayName: "TD3", panelUrl: "/x.png", layout: { ...testLayout, id: "td3" } },
  other: { slug: "other", displayName: "Other", panelUrl: "/x.png", layout: { ...testLayout, id: "other" } },
  [PROTON_CLONE_SLUG]: { slug: PROTON_CLONE_SLUG, displayName: "Behringer Proton", panelUrl: "/x.png", layout: buildProtonCloneLayout() },
};
const repositoryOf = (slug: string) => new LocalPatchRepository(slug === behringerProton.id ? behringerProton : instrumentFromSynth(synths[slug]!));

function deps(overrides: Partial<GuestTransferDeps> = {}) {
  const imported: Array<{ slug: string; patches: Parameters<GuestTransferDeps["importPatches"]>[1] }> = [];
  const value: GuestTransferDeps = {
    loadSynth: async (slug) => synths[slug] ?? null,
    importPatches: async (slug, patches) => {
      imported.push({ slug, patches });
      return true;
    },
    ...overrides,
  };
  return { value, imported };
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("hasGuestContent", () => {
  it("ignores the empty start library and counts names, settings and several patches", () => {
    expect(hasGuestContent(library(patch("a", "New patch")))).toBe(false);
    expect(hasGuestContent(library(patch("a", "Neues Patch")))).toBe(false);
    expect(hasGuestContent(library(patch("a", "Bass")))).toBe(true);
    expect(hasGuestContent(library(patch("a", "New patch", { ...empty, knobs: { k: 1 } })))).toBe(true);
    expect(hasGuestContent(library(patch("a", "New patch"), patch("b", "New patch")))).toBe(true);
  });
});

describe("guest transfer marker", () => {
  it("remembers the registered address, case-insensitively, until cleared", () => {
    expect(guestTransferPendingFor("a@example.test")).toBe(false);
    markGuestTransferPending(" A@Example.test ");
    expect(guestTransferPendingFor("a@example.test")).toBe(true);
    expect(guestTransferPendingFor("b@example.test")).toBe(false);
    expect(guestTransferPendingFor(null)).toBe(false);
    clearGuestTransferPending();
    expect(guestTransferPendingFor("a@example.test")).toBe(false);
  });
});

describe("LocalPatchRepository.storedInstrumentIds", () => {
  it("lists synth libraries and the Proton under its own keys", () => {
    repositoryOf("td3").saveCurrent(library(patch("a", "Bass")));
    repositoryOf(behringerProton.id).saveCurrent(library(patch("b", "Lead")));
    expect(LocalPatchRepository.storedInstrumentIds().sort()).toEqual(["behringer-proton", "td3"]);
  });
});

describe("transferGuestPatches", () => {
  it("copies synths with own patches into the account and removes them from the browser", async () => {
    repositoryOf("td3").saveCurrent(library(patch("a", "Bass"), patch("b", "Lead")));
    repositoryOf("other").saveCurrent(library(patch("c", "New patch")));
    const { value, imported } = deps();
    expect(await transferGuestPatches(value)).toEqual({ transferred: [{ slug: "td3", count: 2 }], failed: [] });
    expect(imported).toEqual([{ slug: "td3", patches: [expect.objectContaining({ id: "a", name: "Bass" }), expect.objectContaining({ id: "b", name: "Lead" })] }]);
    expect(repositoryOf("td3").hasStoredLibrary()).toBe(false);
    expect(repositoryOf("other").hasStoredLibrary()).toBe(true);
  });

  it("skips synths that no longer exist", async () => {
    window.localStorage.setItem("synth-patch-library:gone:v1", "{}");
    const { value, imported } = deps();
    expect(await transferGuestPatches(value)).toEqual({ transferred: [], failed: [] });
    expect(imported).toEqual([]);
  });

  it("moves legacy Proton patches, migrated, into the editable Proton together with its own", async () => {
    repositoryOf(behringerProton.id).saveCurrent(library(patch("legacy", "Old bass", { ...empty, knobs: { "Tune 1": 64 } })));
    repositoryOf(PROTON_CLONE_SLUG).saveCurrent(library(patch("new", "New lead")));
    const { value, imported } = deps();
    expect(await transferGuestPatches(value)).toEqual({ transferred: [{ slug: PROTON_CLONE_SLUG, count: 2 }], failed: [] });
    expect(imported[0]!.slug).toBe(PROTON_CLONE_SLUG);
    expect(imported[0]!.patches.map((item) => item.id)).toEqual(["new", "legacy"]);
    expect(imported[0]!.patches[1]!.data.knobs).toEqual({ [cloneControlId("knob", "Tune 1")]: 64 });
    expect(repositoryOf(behringerProton.id).hasStoredLibrary()).toBe(false);
    expect(repositoryOf(PROTON_CLONE_SLUG).hasStoredLibrary()).toBe(false);
  });

  it("uses the legacy Proton when the editable one does not exist", async () => {
    repositoryOf(behringerProton.id).saveCurrent(library(patch("legacy", "Old bass")));
    const { value, imported } = deps({ loadSynth: async () => null });
    await transferGuestPatches(value);
    expect(imported.map((entry) => entry.slug)).toEqual([behringerProton.id]);
  });

  it("keeps the browser copy and reports the synth when the import fails", async () => {
    repositoryOf("td3").saveCurrent(library(patch("a", "Bass")));
    const { value } = deps({ importPatches: async () => false });
    expect(await transferGuestPatches(value)).toEqual({ transferred: [], failed: ["td3"] });
    expect(repositoryOf("td3").hasStoredLibrary()).toBe(true);
  });

  it("sends large libraries in batches of at most 100 patches", async () => {
    repositoryOf("td3").saveCurrent(library(...Array.from({ length: 230 }, (_, index) => patch(`p${index}`, `Patch ${index}`))));
    const { value, imported } = deps();
    await transferGuestPatches(value);
    expect(imported.map((entry) => entry.patches.length)).toEqual([100, 100, 30]);
  });
});
