import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CLONE_NORMAL_CATEGORY,
  CLONE_SHIFT_CATEGORY,
  LEGACY_PROTON_SLUG,
  PROTON_CLONE_SLUG,
  buildProtonCloneLayout,
  cloneControlId,
} from "@/lib/adapters/proton-legacy-migration-adapter";
import { createDatabase, ensureDatabase, type Database } from "@/lib/db/client";
import { assets, patches, synths, user } from "@/lib/db/schema";
import { categoryStateKey } from "@/lib/domain/switch-categories";
import { attachSample } from "@/lib/patches/sample-service";
import { createPatch, getPatchView, listOwnPatches } from "@/lib/patches/patch-service";
import { LocalFsStorage } from "@/lib/storage/local-fs-storage";
import { cloneLegacyProton, clonePatchId } from "@/lib/synths/proton-clone-service";
import { getSynthView } from "@/lib/synths/synth-service";

const PANEL = new Uint8Array(readFileSync(path.join(process.cwd(), "scripts/assets/behringer-proton-v2-panel.png")));
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02]);
const SMALL_PNG = (() => {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 800);
  view.setUint32(20, 400);
  return bytes;
})();

let db: Database;
let close: () => Promise<void>;
let storage: LocalFsStorage;
let uploadRoot: string;
const admin = { id: randomUUID() };
const other = { id: randomUUID() };
let withSample: string;
let othersPatch: string;

beforeEach(async () => {
  process.env.FEATURE_AUDIO = "true";
  const handle = createDatabase("memory://");
  await ensureDatabase(handle);
  db = handle.db;
  close = () => handle.client.close();
  uploadRoot = mkdtempSync(path.join(tmpdir(), "clone-up-"));
  storage = new LocalFsStorage(uploadRoot, mkdtempSync(path.join(tmpdir(), "clone-tmp-")));
  await db.insert(user).values([
    { id: admin.id, name: "Admin", email: `${admin.id}@example.test`, emailVerified: true },
    { id: other.id, name: "Other", email: `${other.id}@example.test`, emailVerified: true },
  ]);
  const first = await createPatch(db, admin, {
    synthSlug: LEGACY_PROTON_SLUG,
    name: "Forward",
    visibility: "public",
    tags: ["acid", "bass"],
    data: {
      knobs: { "Tune 1": 64 },
      switches: { Sync: true, Loop: true },
      leds: { "OSC1 octave 8": true },
      cables: [{ from: "out-0", to: "in-0", colorId: "red" }],
    },
  });
  const second = await createPatch(db, other, { synthSlug: LEGACY_PROTON_SLUG, name: "Theirs", data: { knobs: { "Tune 2": 10 } } });
  if (!first.ok || !second.ok) throw new Error("setup failed");
  withSample = first.id;
  othersPatch = second.id;
  const sample = await attachSample({ db, storage }, admin, withSample, MP3, { title: "Demo", license: "CC BY 4.0", rightsConfirmed: true });
  if (!sample.ok) throw new Error("sample failed");
});

afterEach(async () => {
  delete process.env.FEATURE_AUDIO;
  await close();
});

const run = (apply: boolean, ownerId = admin.id, panelBytes = PANEL) => cloneLegacyProton({ db, storage }, { ownerId, panelBytes, apply });

describe("cloneLegacyProton", () => {
  it("only reports the plan without apply", async () => {
    const result = await run(false);
    expect(result).toMatchObject({
      ok: true,
      report: {
        synth: "create",
        patches: expect.arrayContaining([
          expect.objectContaining({ legacyId: withSample, cloneId: clonePatchId(withSample), action: "copy", sample: true, values: { knobs: 1, switches: 2, leds: 1, cables: 1 } }),
          expect.objectContaining({ legacyId: othersPatch, ownerId: other.id, action: "copy", sample: false }),
        ]),
      },
    });
    expect(await getSynthView(db, PROTON_CLONE_SLUG, null)).toBeNull();
    expect(await db.select().from(patches)).toHaveLength(2);
  });

  it("creates the clone for the owner with its panel and copies every user's patches", async () => {
    expect(await run(true)).toMatchObject({ ok: true, report: { synth: "create" } });

    const view = await getSynthView(db, PROTON_CLONE_SLUG, null);
    expect(view).toMatchObject({ ownerId: admin.id, isBuiltIn: false, revision: 1, displayName: "Behringer Proton", manufacturer: "Behringer" });
    expect(view?.layout).toEqual(buildProtonCloneLayout());
    expect(view?.panelUrl).toMatch(/^\/assets\/uploads\/.+\.png$/);

    const copy = await getPatchView(db, admin, clonePatchId(withSample));
    expect(copy).toMatchObject({ name: "Forward", visibility: "public", synth: { slug: PROTON_CLONE_SLUG } });
    expect([...(copy?.tags ?? [])].sort()).toEqual(["acid", "bass"]);
    expect(copy?.data.knobs).toEqual({ [cloneControlId("knob", "Tune 1")]: 64 });
    expect(copy?.data.switches).toEqual({
      [cloneControlId("switch", "Sync")]: true,
      [categoryStateKey(cloneControlId("switch", "Loop"), CLONE_NORMAL_CATEGORY.id)]: true,
    });
    expect(copy?.data.cables).toEqual([{ from: cloneControlId("out", "out-0"), to: cloneControlId("in", "in-0"), colorId: "red" }]);
    expect(copy?.sample).toMatchObject({ title: "Demo", license: "CC BY 4.0" });

    const original = await getPatchView(db, admin, withSample);
    expect(copy?.sample?.url).not.toBe(original?.sample?.url);
    expect(original?.data.knobs).toEqual({ "Tune 1": 64 });

    const theirs = await getPatchView(db, other, clonePatchId(othersPatch));
    expect(theirs).toMatchObject({ name: "Theirs", isOwner: true, visibility: "private" });
    expect((await listOwnPatches(db, other)).map((patch) => patch.id).sort()).toEqual([othersPatch, clonePatchId(othersPatch)].sort());
  });

  it("can run again without creating duplicates", async () => {
    await run(true);
    const again = await run(true);
    expect(again).toMatchObject({ ok: true, report: { synth: "exists" } });
    if (!again.ok) return;
    expect(again.report.patches.every((patch) => patch.action === "exists")).toBe(true);
    expect(await db.select().from(synths).where(eq(synths.slug, PROTON_CLONE_SLUG))).toHaveLength(1);
    expect(await db.select().from(patches)).toHaveLength(4);
    expect(await db.select().from(assets).where(eq(assets.kind, "sample"))).toHaveLength(2);
  });

  it("copies the sample file, so both patches keep their own", async () => {
    await run(true);
    const samples = await db.select().from(assets).where(eq(assets.kind, "sample"));
    expect(new Set(samples.map((asset) => asset.storageKey)).size).toBe(2);
    for (const asset of samples) expect(existsSync(path.join(uploadRoot, asset.storageKey))).toBe(true);
    expect(samples.find((asset) => asset.storageKey !== samples[0]!.storageKey)?.ownerId).toBe(admin.id);
  });

  it("refuses when the clone's identifier belongs to someone else", async () => {
    await run(true, other.id);
    expect(await run(true, admin.id)).toEqual({ ok: false, error: "slug-taken", ownerId: other.id });
  });

  it("refuses a panel of the wrong size and writes nothing", async () => {
    const result = await run(true, admin.id, SMALL_PNG);
    expect(result).toEqual({ ok: false, error: "panel-invalid", detail: "expected 2048x653, got 800x400" });
    expect(await getSynthView(db, PROTON_CLONE_SLUG, null)).toBeNull();
    expect(await db.select().from(patches)).toHaveLength(2);
  });
});

describe("clonePatchId", () => {
  it("is a valid UUID, the same for the same original and different for others", () => {
    expect(z.string().uuid().safeParse(clonePatchId(withSample)).success).toBe(true);
    expect(clonePatchId("a")).toBe(clonePatchId("a"));
    expect(clonePatchId("a")).not.toBe(clonePatchId("b"));
  });
});

describe("shift state of copied patches", () => {
  it("keeps the active Shift category and blue-channel states when the legacy data has them", async () => {
    const legacyId = randomUUID();
    await db.insert(patches).values({
      id: legacyId,
      ownerId: admin.id,
      synthRevisionId: (await db.select().from(patches).where(eq(patches.id, withSample)))[0]!.synthRevisionId,
      name: "Blue",
      visibility: "private",
      revision: 1,
      data: { schemaVersion: 1, knobs: {}, switches: { "Shift::blue": true, "Loop::blue": true }, leds: {}, cables: [] },
    });
    await run(true);
    const copy = await getPatchView(db, admin, clonePatchId(legacyId));
    expect(copy?.data.switches).toEqual({
      [categoryStateKey(cloneControlId("switch", "Shift"), CLONE_SHIFT_CATEGORY.id)]: true,
      [categoryStateKey(cloneControlId("switch", "Loop"), CLONE_SHIFT_CATEGORY.id)]: true,
    });
  });
});
