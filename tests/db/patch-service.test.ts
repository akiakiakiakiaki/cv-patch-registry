import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDatabase, ensureDatabase } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { storePanelUpload } from "@/lib/assets/asset-service";
import { LocalFsStorage } from "@/lib/storage/local-fs-storage";
import { createSynth } from "@/lib/synths/synth-service";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import {
  createPatch,
  deletePatch,
  getPatchView,
  importLocalPatches,
  listOwnPatches,
  listPublicPatches,
  updatePatch,
} from "@/lib/patches/patch-service";

const PNG = (() => {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 800);
  view.setUint32(20, 400);
  return bytes;
})();

const PROTON = behringerProton.layout.id;
const KNOB = behringerProton.layout.knobs[0]!.id;
const IN_PORT = behringerProton.layout.ports.find((port) => port.kind === "in")!.id;
const OUT_PORT = behringerProton.layout.ports.find((port) => port.kind === "out")!.id;

async function setup() {
  const handle = createDatabase("memory://");
  await ensureDatabase(handle);
  const db = handle.db;
  const owner = { id: randomUUID() };
  const stranger = { id: randomUUID() };
  await db.insert(user).values([
    { id: owner.id, name: "Owner", email: `${owner.id}@example.test`, emailVerified: true },
    { id: stranger.id, name: "Stranger", email: `${stranger.id}@example.test`, emailVerified: true },
  ]);
  const storage = new LocalFsStorage(mkdtempSync(path.join(tmpdir(), "patch-up-")), mkdtempSync(path.join(tmpdir(), "patch-tmp-")));
  return { db, owner, stranger, storage, cleanup: () => handle.client.close() };
}

describe("patch lifecycle", () => {
  it("creates a private patch on a built-in synth and shows it only to its owner", async () => {
    const env = await setup();
    const created = await createPatch(env.db, env.owner, { synthSlug: PROTON, name: "Bass 1", data: { knobs: { [KNOB]: 80 } } });
    expect(created).toMatchObject({ ok: true, revision: 1 });
    if (!created.ok) return;

    expect(await getPatchView(env.db, env.owner, created.id)).toMatchObject({ name: "Bass 1", isOwner: true, data: { knobs: { [KNOB]: 80 } } });
    expect(await getPatchView(env.db, env.stranger, created.id)).toBeNull();
    expect(await getPatchView(env.db, null, created.id)).toBeNull();
    env.cleanup();
  });

  it("publishes with a revision check and makes the patch public", async () => {
    const env = await setup();
    const created = await createPatch(env.db, env.owner, { synthSlug: PROTON, name: "Pad" });
    if (!created.ok) throw new Error("setup failed");

    const published = await updatePatch(env.db, env.owner, created.id, { name: "Pad", expectedRevision: 1, visibility: "public" });
    expect(published).toEqual({ ok: true, revision: 2 });
    expect(await getPatchView(env.db, null, created.id)).toMatchObject({ visibility: "public", revision: 2 });
    expect((await listPublicPatches(env.db, {})).map((patch) => patch.id)).toContain(created.id);
    expect((await listOwnPatches(env.db, env.owner)).map((patch) => patch.id)).toContain(created.id);
    env.cleanup();
  });

  it("answers 409 for a stale revision and 404 for a stranger", async () => {
    const env = await setup();
    const created = await createPatch(env.db, env.owner, { synthSlug: PROTON, name: "Lead" });
    if (!created.ok) throw new Error("setup failed");
    await updatePatch(env.db, env.owner, created.id, { name: "Lead", expectedRevision: 1 });

    expect(await updatePatch(env.db, env.owner, created.id, { name: "Lost", expectedRevision: 1 })).toEqual({ ok: false, error: "conflict" });
    expect(await updatePatch(env.db, env.stranger, created.id, { name: "Hijack", expectedRevision: 2 })).toEqual({ ok: false, error: "not-found" });
    expect(await getPatchView(env.db, env.owner, created.id)).toMatchObject({ name: "Lead", revision: 2 });
    env.cleanup();
  });

  it("deletes only for the owner", async () => {
    const env = await setup();
    const created = await createPatch(env.db, env.owner, { synthSlug: PROTON, name: "Temp" });
    if (!created.ok) throw new Error("setup failed");
    expect(await deletePatch(env.db, env.stranger, created.id)).toEqual({ ok: false, error: "not-found" });
    expect(await deletePatch(env.db, env.owner, created.id)).toEqual({ ok: true });
    expect(await getPatchView(env.db, env.owner, created.id)).toBeNull();
    env.cleanup();
  });

  it("normalizes tags and enforces the limit", async () => {
    const env = await setup();
    const created = await createPatch(env.db, env.owner, { synthSlug: PROTON, name: "Tagged", tags: ["Bass", " bass ", "Sound Design"] });
    if (!created.ok) throw new Error("setup failed");
    expect((await getPatchView(env.db, env.owner, created.id))?.tags).toEqual(["bass", "sound design"]);

    const eleven = Array.from({ length: 11 }, (_, index) => `tag ${index}`);
    expect(await createPatch(env.db, env.owner, { synthSlug: PROTON, name: "Too many", tags: eleven })).toEqual({ ok: false, error: "too-many-tags" });
    expect(await createPatch(env.db, env.owner, { synthSlug: PROTON, name: "Bad", tags: ["<b>"] })).toEqual({ ok: false, error: "invalid-tags" });
    env.cleanup();
  });

  it("filters explore by tag and synth", async () => {
    const env = await setup();
    const created = await createPatch(env.db, env.owner, { synthSlug: PROTON, name: "Explore me", tags: ["bass"], visibility: "public" });
    if (!created.ok) throw new Error("setup failed");
    expect((await listPublicPatches(env.db, { tagSlug: "bass" })).map((patch) => patch.name)).toEqual(["Explore me"]);
    expect(await listPublicPatches(env.db, { tagSlug: "lead" })).toEqual([]);
    expect((await listPublicPatches(env.db, { synthSlug: PROTON })).length).toBe(1);
    env.cleanup();
  });

  it("drops data for controls and ports the synth does not have", async () => {
    const env = await setup();
    const created = await createPatch(env.db, env.owner, {
      synthSlug: PROTON,
      name: "Messy",
      data: {
        knobs: { [KNOB]: 1, Ghost: 2 },
        cables: [{ from: IN_PORT, to: IN_PORT, colorId: "red" }, { from: OUT_PORT, to: IN_PORT, colorId: "red" }],
      },
    });
    if (!created.ok) throw new Error("setup failed");
    const view = await getPatchView(env.db, env.owner, created.id);
    expect(view?.data.knobs).toEqual({ [KNOB]: 1 });
    expect(view?.data.cables).toEqual([{ from: OUT_PORT, to: IN_PORT, colorId: "red" }]);
    env.cleanup();
  });

  it("rejects an unknown synth and invalid input", async () => {
    const env = await setup();
    expect(await createPatch(env.db, env.owner, { synthSlug: "nope-nope", name: "x" })).toEqual({ ok: false, error: "synth-not-found" });
    expect(await createPatch(env.db, env.owner, { synthSlug: PROTON, name: "" })).toMatchObject({ ok: false, error: "invalid" });
    env.cleanup();
  });

  it("creates patches on a user synth with its own revision", async () => {
    const env = await setup();
    const stored = await storePanelUpload({ db: env.db, storage: env.storage }, env.owner, PNG);
    if (!stored.ok) throw new Error("upload failed");
    const synth = await createSynth(env.db, env.owner, {
      displayName: "Mine",
      slug: "mine-synth",
      panelAssetId: stored.panel.id,
      controls: [{ id: "knob-1a2b3c4d", kind: "knob", label: "Knob 1", x: 100, y: 100 }],
    });
    expect(synth.ok).toBe(true);
    const created = await createPatch(env.db, env.owner, { synthSlug: "mine-synth", name: "Mine 1", data: { knobs: { "knob-1a2b3c4d": 40 } } });
    if (!created.ok) throw new Error("patch failed");
    const view = await getPatchView(env.db, env.owner, created.id);
    expect(view?.synth.panelUrl).toMatch(/^\/assets\/uploads\//);
    expect(view?.data.knobs).toEqual({ "knob-1a2b3c4d": 40 });
    env.cleanup();
  });
});

describe("local import", () => {
  it("copies browser patches into the account as private patches with new IDs", async () => {
    const env = await setup();
    const result = await importLocalPatches(env.db, env.owner, {
      synthSlug: PROTON,
      patches: [
        { name: "Imported A", data: { knobs: { [KNOB]: 12 }, cables: [] } },
        { name: "Imported B" },
      ],
    });
    expect(result).toEqual({ ok: true, created: 2 });
    const own = await listOwnPatches(env.db, env.owner);
    expect(own.map((patch) => patch.name).sort()).toEqual(["Imported A", "Imported B"]);
    expect(own.every((patch) => patch.visibility === "private")).toBe(true);
    expect(await listPublicPatches(env.db, {})).toEqual([]);
    env.cleanup();
  });

  it("rejects an import for an unknown synth", async () => {
    const env = await setup();
    expect(await importLocalPatches(env.db, env.owner, { synthSlug: "nope-nope", patches: [{ name: "x" }] })).toEqual({
      ok: false,
      error: "synth-not-found",
    });
    env.cleanup();
  });
});
