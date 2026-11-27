import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase, ensureDatabase, type Database } from "@/lib/db/client";
import { patches, user } from "@/lib/db/schema";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import {
  createPatch,
  getPatchView,
  importLocalPatches,
  listOwnPatchStates,
  listOwnPatches,
  listPublicPatches,
  updatePatch,
} from "@/lib/patches/patch-service";
import { listPatchesWithSynth } from "@/lib/repositories/patches-repository";
import { hiddenSynthSlugs, legacySynthsVisible } from "@/lib/synths/legacy-visibility";
import { getSynthView, listSynthViews } from "@/lib/synths/synth-service";

const LEGACY = behringerProton.id;
let db: Database;
let close: () => Promise<void>;
const owner = { id: randomUUID() };
let legacyPatch: string;

beforeEach(async () => {
  const handle = createDatabase("memory://");
  await ensureDatabase(handle);
  db = handle.db;
  close = () => handle.client.close();
  await db.insert(user).values({ id: owner.id, name: "Owner", email: `${owner.id}@example.test`, emailVerified: true });
  const created = await createPatch(db, owner, { synthSlug: LEGACY, name: "Old", visibility: "public", data: { knobs: { "Tune 1": 3 } } });
  if (!created.ok) throw new Error("setup failed");
  legacyPatch = created.id;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await close();
});

describe("legacy synth visibility flag", () => {
  it("keeps legacy synths visible unless FEATURE_LEGACY_SYNTHS is exactly false", () => {
    expect(legacySynthsVisible()).toBe(true);
    vi.stubEnv("FEATURE_LEGACY_SYNTHS", "true");
    expect(hiddenSynthSlugs()).toEqual([]);
    vi.stubEnv("FEATURE_LEGACY_SYNTHS", "0");
    expect(legacySynthsVisible()).toBe(true);
    vi.stubEnv("FEATURE_LEGACY_SYNTHS", "false");
    expect(hiddenSynthSlugs()).toEqual([LEGACY]);
  });
});

describe("with FEATURE_LEGACY_SYNTHS=false", () => {
  beforeEach(() => {
    vi.stubEnv("FEATURE_LEGACY_SYNTHS", "false");
  });

  it("hides the legacy synth from the catalog and its view", async () => {
    expect((await listSynthViews(db, null)).map((view) => view.slug)).not.toContain(LEGACY);
    expect(await getSynthView(db, LEGACY, null)).toBeNull();
  });

  it("hides its patches from owners, explore and links", async () => {
    expect(await getPatchView(db, owner, legacyPatch)).toBeNull();
    expect(await getPatchView(db, null, legacyPatch)).toBeNull();
    expect(await listOwnPatches(db, owner)).toEqual([]);
    expect(await listOwnPatchStates(db, owner, LEGACY)).toEqual([]);
    expect(await listPublicPatches(db, {})).toEqual([]);
  });

  it("refuses new, changed and imported patches for it", async () => {
    expect(await createPatch(db, owner, { synthSlug: LEGACY, name: "New" })).toEqual({ ok: false, error: "synth-not-found" });
    expect(await updatePatch(db, owner, legacyPatch, { name: "Renamed", expectedRevision: 1 })).toEqual({ ok: false, error: "not-found" });
    expect(await importLocalPatches(db, owner, { synthSlug: LEGACY, patches: [{ name: "Imported" }] })).toEqual({ ok: false, error: "synth-not-found" });
  });

  it("keeps the data, and migrations can still read it", async () => {
    expect(await db.select().from(patches)).toHaveLength(1);
    expect((await listPatchesWithSynth(db, { synthSlug: LEGACY, includeHidden: true, viewer: null })).map((row) => row.patch.id)).toEqual([legacyPatch]);
  });

  it("shows everything again once the flag is lifted", async () => {
    vi.stubEnv("FEATURE_LEGACY_SYNTHS", "true");
    expect((await listSynthViews(db, null)).map((view) => view.slug)).toContain(LEGACY);
    expect(await getPatchView(db, owner, legacyPatch)).toMatchObject({ name: "Old" });
  });
});
