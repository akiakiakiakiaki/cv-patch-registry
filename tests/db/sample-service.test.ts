import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDatabase, ensureDatabase } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { insertAsset } from "@/lib/repositories/assets-repository";
import { LocalFsStorage } from "@/lib/storage/local-fs-storage";
import { attachSample } from "@/lib/patches/sample-service";
import { createPatch, getPatchView } from "@/lib/patches/patch-service";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";

const PROTON = behringerProton.layout.id;
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02]);
const META = { title: "Sub drone", license: "CC BY 4.0", rightsConfirmed: true };

let handleClose: () => Promise<void>;
let db: Awaited<ReturnType<typeof setupDatabase>>["db"];
let storage: LocalFsStorage;
let owner: { id: string };
let stranger: { id: string };
let patchId: string;

async function setupDatabase() {
  const handle = createDatabase("memory://");
  await ensureDatabase(handle);
  return { db: handle.db, close: () => handle.client.close() };
}

beforeEach(async () => {
  process.env.FEATURE_AUDIO = "true";
  const setup = await setupDatabase();
  db = setup.db;
  handleClose = async () => setup.close();
  storage = new LocalFsStorage(mkdtempSync(path.join(tmpdir(), "sample-up-")), mkdtempSync(path.join(tmpdir(), "sample-tmp-")));
  owner = { id: randomUUID() };
  stranger = { id: randomUUID() };
  await db.insert(user).values([
    { id: owner.id, name: "Owner", email: `${owner.id}@example.test`, emailVerified: true },
    { id: stranger.id, name: "Stranger", email: `${stranger.id}@example.test`, emailVerified: true },
  ]);
  const created = await createPatch(db, owner, { synthSlug: PROTON, name: "With sample", visibility: "public" });
  if (!created.ok) throw new Error("setup failed");
  patchId = created.id;
});

afterEach(async () => {
  delete process.env.FEATURE_AUDIO;
  await handleClose();
});

describe("patch samples", () => {
  it("stores one MP3 sample for the owner and shows it in the patch view", async () => {
    const result = await attachSample({ db, storage }, owner, patchId, MP3, META);
    expect(result).toMatchObject({ ok: true, sample: { title: "Sub drone", license: "CC BY 4.0" } });
    expect((await getPatchView(db, null, patchId))?.sample).toMatchObject({ title: "Sub drone" });
  });

  it("allows only one sample per patch", async () => {
    await attachSample({ db, storage }, owner, patchId, MP3, META);
    expect(await attachSample({ db, storage }, owner, patchId, MP3, META)).toEqual({ ok: false, error: "sample-exists" });
  });

  it("answers not-found for anyone but the owner", async () => {
    expect(await attachSample({ db, storage }, stranger, patchId, MP3, META)).toEqual({ ok: false, error: "not-found" });
  });

  it("refuses without the rights confirmation", async () => {
    expect(await attachSample({ db, storage }, owner, patchId, MP3, { ...META, rightsConfirmed: false })).toEqual({ ok: false, error: "invalid" });
  });

  it("refuses files that are not MP3", async () => {
    expect(await attachSample({ db, storage }, owner, patchId, new TextEncoder().encode("RIFF....WAVE"), META)).toEqual({
      ok: false,
      error: "unsupported-type",
    });
  });

  it("refuses files above the hard size limit", async () => {
    const big = new Uint8Array(1_500_001);
    big.set(MP3, 0);
    expect(await attachSample({ db, storage }, owner, patchId, big, META)).toEqual({ ok: false, error: "too-large" });
  });

  it("enforces the 50 MB quota per owner", async () => {
    await insertAsset(db, {
      id: randomUUID(),
      ownerId: owner.id,
      kind: "panel",
      mime: "image/png",
      byteSize: 50 * 1024 * 1024 - 10,
      sha256: "0".repeat(64),
      storageKey: `${randomUUID()}.png`,
      status: "active",
    });
    expect(await attachSample({ db, storage }, owner, patchId, MP3, META)).toEqual({ ok: false, error: "quota" });
  });

  it("does nothing while the feature flag is off", async () => {
    process.env.FEATURE_AUDIO = "false";
    expect(await attachSample({ db, storage }, owner, patchId, MP3, META)).toEqual({ ok: false, error: "disabled" });
    expect((await getPatchView(db, null, patchId))?.sample).toBeNull();
  });
});
