import { existsSync, mkdtempSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { PANEL_MAX_COUNT, STORAGE_QUOTA_BYTES, UNUSED_PANEL_TTL_MS } from "@/lib/assets/asset-quota";
import { storePanelUpload } from "@/lib/assets/asset-service";
import { createDatabase, ensureDatabase } from "@/lib/db/client";
import { assets, user } from "@/lib/db/schema";
import { insertAsset } from "@/lib/repositories/assets-repository";
import { LocalFsStorage } from "@/lib/storage/local-fs-storage";
import { createSynth } from "@/lib/synths/synth-service";

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
  await db.insert(user).values({ id: owner.id, name: "Owner", email: `${owner.id}@example.test`, emailVerified: true });
  const uploadRoot = mkdtempSync(path.join(tmpdir(), "panel-up-"));
  const storage = new LocalFsStorage(uploadRoot, mkdtempSync(path.join(tmpdir(), "panel-tmp-")));
  return { db, owner, storage, uploadRoot, cleanup: () => handle.client.close() };
}

type Env = Awaited<ReturnType<typeof setup>>;

async function upload(env: Env, now = new Date()) {
  const result = await storePanelUpload({ db: env.db, storage: env.storage }, env.owner, PNG, now);
  if (!result.ok) throw new Error(`upload rejected: ${result.reason}`);
  const [row] = await env.db.select().from(assets).where(eq(assets.id, result.panel.id));
  return row!;
}

async function age(env: Env, assetId: string, milliseconds: number) {
  await env.db.update(assets).set({ createdAt: new Date(Date.now() - milliseconds) }).where(eq(assets.id, assetId));
}

const fillerAsset = (ownerId: string, byteSize: number) => ({
  id: randomUUID(),
  ownerId,
  kind: "sample",
  mime: "audio/mpeg",
  byteSize,
  sha256: "0".repeat(64),
  storageKey: `${randomUUID()}.mp3`,
  status: "active",
});

describe("panel upload limits", () => {
  it("rejects a panel that would exceed the storage shared with samples", async () => {
    const env = await setup();
    await insertAsset(env.db, fillerAsset(env.owner.id, STORAGE_QUOTA_BYTES - 10));
    expect(await storePanelUpload({ db: env.db, storage: env.storage }, env.owner, PNG)).toEqual({ ok: false, reason: "quota" });
    env.cleanup();
  });

  it(`rejects more than ${PANEL_MAX_COUNT} panels per user`, async () => {
    const env = await setup();
    for (let index = 0; index < PANEL_MAX_COUNT; index += 1) {
      await insertAsset(env.db, { ...fillerAsset(env.owner.id, 10), kind: "panel", mime: "image/png", storageKey: `${randomUUID()}.png` });
    }
    expect(await storePanelUpload({ db: env.db, storage: env.storage }, env.owner, PNG)).toEqual({ ok: false, reason: "quota" });
    env.cleanup();
  });

  it("removes old panels no synth uses before counting, file included", async () => {
    const env = await setup();
    const abandoned = await upload(env);
    await age(env, abandoned.id, UNUSED_PANEL_TTL_MS + 60_000);
    expect(existsSync(path.join(env.uploadRoot, abandoned.storageKey))).toBe(true);

    await upload(env);
    expect(await env.db.select().from(assets).where(eq(assets.id, abandoned.id))).toEqual([]);
    expect(existsSync(path.join(env.uploadRoot, abandoned.storageKey))).toBe(false);
    env.cleanup();
  });

  it("keeps panels a synth uses and recent uploads the editor may still save", async () => {
    const env = await setup();
    const used = await upload(env);
    const created = await createSynth(env.db, env.owner, { displayName: "Mine", slug: "mine-synth", panelAssetId: used.id, controls: [] });
    expect(created.ok).toBe(true);
    const recent = await upload(env);
    await age(env, used.id, UNUSED_PANEL_TTL_MS + 60_000);
    await age(env, recent.id, UNUSED_PANEL_TTL_MS - 60_000);

    await upload(env);
    const remaining = (await env.db.select({ id: assets.id }).from(assets)).map((row) => row.id);
    expect(remaining).toEqual(expect.arrayContaining([used.id, recent.id]));
    expect(existsSync(path.join(env.uploadRoot, used.storageKey))).toBe(true);
    env.cleanup();
  });
});
