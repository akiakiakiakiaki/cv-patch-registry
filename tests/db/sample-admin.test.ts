import { describe, expect, it, vi } from "vitest";
import { createDatabase, ensureDatabase } from "@/lib/db/client";
import { assets, patchSamples, user } from "@/lib/db/schema";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import { createPatch, deletePatch } from "@/lib/patches/patch-service";
import { listSampleGroups } from "@/lib/samples/sample-admin";

/** Two sample files on patches of the built-in synth, one owned by each user. */
async function setup() {
  const handle = createDatabase("memory://");
  await ensureDatabase(handle);
  const db = handle.db;
  const ada = { id: "ada", role: "user" };
  const bob = { id: "bob", role: "user" };
  await db.insert(user).values([
    { id: ada.id, name: "Ada", email: "ada@example.test", emailVerified: true },
    { id: bob.id, name: "Bob", email: "bob@example.test", emailVerified: true },
  ]);
  const patchOf = async (owner: { id: string }, name: string) => {
    const created = await createPatch(db, owner, { synthSlug: behringerProton.id, name, visibility: "public" });
    if (!created.ok) throw new Error("patch failed");
    return created.id;
  };
  const sampleOn = async (owner: { id: string }, patchId: string, key: string, title: string) => {
    await db.insert(assets).values({ id: key, ownerId: owner.id, kind: "sample", mime: "audio/mpeg", byteSize: 1024, sha256: key, storageKey: `${key}.mp3` });
    await db.insert(patchSamples).values({ patchId, assetId: key, title, license: "CC0", rightsConfirmedAt: new Date() });
  };
  const adasPatch = await patchOf(ada, "Ada's bass");
  const bobsPatch = await patchOf(bob, "Bob's lead");
  await sampleOn(ada, adasPatch, "11111111-1111-4111-8111-111111111111", "Bass take");
  await sampleOn(bob, bobsPatch, "22222222-2222-4222-8222-222222222222", "Lead take");
  return { db, ada, bob, adasPatch, cleanup: () => handle.client.close() };
}

describe("sample overview", () => {
  it("groups the files by the synth of their patch, with title, patch and uploader, for admins only", async () => {
    const env = await setup();
    expect(await listSampleGroups(env.db, env.ada)).toBeNull();
    const groups = await listSampleGroups(env.db, { id: "admin", role: "admin" });
    expect(groups).toHaveLength(1);
    expect(groups![0]!.synth).toMatchObject({ slug: behringerProton.id, deleted: false });
    const bass = groups![0]!.samples.find((sample) => sample.sample?.title === "Bass take");
    expect(bass).toMatchObject({ sample: { license: "CC0" }, patch: { name: "Ada's bass", ownerName: "Ada", visibility: "public" }, uploader: { name: "Ada" } });
    expect(bass?.url).toMatch(/11111111-1111-4111-8111-111111111111\.mp3$/);
    env.cleanup();
  });

  it("lists files no patch uses anymore first, in their own group", async () => {
    const env = await setup();
    await deletePatch(env.db, env.ada, env.adasPatch);
    const groups = await listSampleGroups(env.db, { id: "owner", role: "owner" });
    expect(groups!.map((group) => group.synth?.slug ?? null)).toEqual([null, behringerProton.id]);
    expect(groups![0]!.samples).toHaveLength(1);
    expect(groups![0]!.samples[0]).toMatchObject({ sample: null, patch: null, uploader: { name: "Ada" } });
    expect(groups![1]!.samples.map((sample) => sample.sample?.title)).toEqual(["Lead take"]);
    env.cleanup();
  });

  it("leaves out samples of hidden legacy synths, like everywhere else", async () => {
    const env = await setup();
    vi.stubEnv("FEATURE_LEGACY_SYNTHS", "false");
    try {
      // The fixture's patches are on the built-in (legacy) Proton.
      expect(await listSampleGroups(env.db, { id: "admin", role: "admin" })).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
    expect((await listSampleGroups(env.db, { id: "admin", role: "admin" }))?.[0]?.samples).toHaveLength(2);
    env.cleanup();
  });
});

