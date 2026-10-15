import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDatabase, ensureDatabase } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { storePanelUpload } from "@/lib/assets/asset-service";
import { LocalFsStorage } from "@/lib/storage/local-fs-storage";
import { createSynth, createSynthRevision, getSynthView, listSynthViews } from "@/lib/synths/synth-service";
import { deleteSynth } from "@/lib/synths/synth-delete";
import { createPatch, getPatchView, listPublicPatches, updatePatch } from "@/lib/patches/patch-service";

const PNG = (() => {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 800);
  view.setUint32(20, 400);
  return bytes;
})();

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
  const root = mkdtempSync(path.join(tmpdir(), "del-up-"));
  const storage = new LocalFsStorage(root, mkdtempSync(path.join(tmpdir(), "del-tmp-")));
  const stored = await storePanelUpload({ db, storage }, owner, PNG);
  if (!stored.ok) throw new Error("upload failed");
  const created = await createSynth(db, owner, { displayName: "Gone", slug: "gone-synth", panelAssetId: stored.panel.id, controls: [] });
  if (!created.ok) throw new Error("create failed");
  return { handle, db, owner, stranger, root, panelKey: stored.panel.url.split("/").pop()!, cleanup: () => handle.client.close() };
}

describe("soft-deleting a user synth", () => {
  it("answers not-found for anyone but the owner", async () => {
    const env = await setup();
    expect(await deleteSynth(env.db, env.stranger, "gone-synth")).toEqual({ ok: false, error: "not-found" });
    expect(await getSynthView(env.db, "gone-synth")).not.toBeNull();
    env.cleanup();
  });

  it("works even though the owner's auto-created patch exists", async () => {
    const env = await setup();
    await createPatch(env.db, env.owner, { synthSlug: "gone-synth", name: "Auto" });
    expect(await deleteSynth(env.db, env.owner, "gone-synth")).toEqual({ ok: true });
    env.cleanup();
  });

  it("hides the synth from lists, views and revisions", async () => {
    const env = await setup();
    expect(await deleteSynth(env.db, env.owner, "gone-synth")).toEqual({ ok: true });
    expect(await getSynthView(env.db, "gone-synth")).toBeNull();
    expect((await listSynthViews(env.db)).map((view) => view.slug)).not.toContain("gone-synth");
    expect(await createSynthRevision(env.db, env.owner, "gone-synth", { displayName: "x", slug: "gone-synth", expectedRevision: 1, controls: [] })).toEqual({
      ok: false,
      error: "not-found",
    });
    env.cleanup();
  });

  it("hides and freezes its patches", async () => {
    const env = await setup();
    const created = await createPatch(env.db, env.owner, { synthSlug: "gone-synth", name: "Public", visibility: "public" });
    if (!created.ok) throw new Error("patch failed");
    expect(await getPatchView(env.db, null, created.id)).not.toBeNull();
    await deleteSynth(env.db, env.owner, "gone-synth");
    expect(await getPatchView(env.db, null, created.id)).toBeNull();
    expect(await listPublicPatches(env.db, {})).toEqual([]);
    expect(await updatePatch(env.db, env.owner, created.id, { name: "x", expectedRevision: 1 })).toEqual({ ok: false, error: "not-found" });
    env.cleanup();
  });

  it("keeps the identifier reserved and the panel image on disk", async () => {
    const env = await setup();
    await deleteSynth(env.db, env.owner, "gone-synth");
    expect(existsSync(path.join(env.root, env.panelKey))).toBe(true);
    const again = await createSynth(env.db, env.owner, { displayName: "Again", slug: "gone-synth", controls: [] });
    expect(again).toEqual({ ok: false, error: "panel" });
    env.cleanup();
  });
});
