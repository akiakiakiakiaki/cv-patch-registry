import { describe, expect, it, vi } from "vitest";
import { createDatabase, ensureDatabase } from "@/lib/db/client";
import { assets, patchSamples, user } from "@/lib/db/schema";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import { createPatch, updatePatch } from "@/lib/patches/patch-service";
import { listPatchGroups } from "@/lib/patches/patch-admin";

describe("patch overview", () => {
  it("lists every patch, private ones too, with owner, tags, sample and revisions, for admins only", async () => {
    const handle = createDatabase("memory://");
    await ensureDatabase(handle);
    const db = handle.db;
    await db.insert(user).values([
      { id: "ada", name: "Ada", email: "ada@example.test", emailVerified: true },
      { id: "bob", name: "Bob", email: "bob@example.test", emailVerified: true },
    ]);
    const priv = await createPatch(db, { id: "ada" }, { synthSlug: behringerProton.id, name: "Secret", tags: ["Acid"] });
    const pub = await createPatch(db, { id: "bob" }, { synthSlug: behringerProton.id, name: "Shared", visibility: "public" });
    if (!priv.ok || !pub.ok) throw new Error("patch failed");
    await updatePatch(db, { id: "ada" }, priv.id, { name: "Secret v2", expectedRevision: 1 });
    await db.insert(assets).values({ id: "s1", ownerId: "bob", kind: "sample", mime: "audio/mpeg", byteSize: 1, sha256: "x", storageKey: "11111111-1111-4111-8111-111111111111.mp3" });
    await db.insert(patchSamples).values({ patchId: pub.id, assetId: "s1", title: "Take", license: "CC0", rightsConfirmedAt: new Date() });

    expect(await listPatchGroups(db, { id: "ada", role: "user" })).toBeNull();
    const groups = await listPatchGroups(db, { id: "admin", role: "admin" });
    expect(groups).toHaveLength(1);
    expect(groups![0]!.synth).toMatchObject({ slug: behringerProton.id, currentRevision: 1, deleted: false });
    const byName = Object.fromEntries(groups![0]!.patches.map((patch) => [patch.name, patch]));
    expect(byName["Secret v2"]).toMatchObject({ owner: { name: "Ada", email: "ada@example.test" }, visibility: "private", tagLabels: ["Acid"], revision: 2, synthRevision: 1, hasSample: false });
    expect(byName.Shared).toMatchObject({ visibility: "public", hasSample: true, revision: 1 });
    // Newest change first.
    expect(groups![0]!.patches[0]!.name).toBe("Secret v2");

    vi.stubEnv("FEATURE_LEGACY_SYNTHS", "false");
    try {
      expect(await listPatchGroups(db, { id: "admin", role: "admin" })).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
    await handle.client.close();
  });
});
