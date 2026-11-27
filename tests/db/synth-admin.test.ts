import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { storePanelUpload } from "@/lib/assets/asset-service";
import { createDatabase, ensureDatabase } from "@/lib/db/client";
import { assets, patches, synthRevisions, user } from "@/lib/db/schema";
import { canEditSynth, canSeeSynth } from "@/lib/domain/policy";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import { createPatch, getPatchView, listOwnPatchStates, listPublicPatches } from "@/lib/patches/patch-service";
import { findSynthBySlug } from "@/lib/repositories/synths-repository";
import { LocalFsStorage } from "@/lib/storage/local-fs-storage";
import { listSynthsForAdminArea, purgeSynth, reduceRevisions, setApproval, setDeleted } from "@/lib/synths/synth-admin";
import { deleteSynth } from "@/lib/synths/synth-delete";
import { createSynth, createSynthRevision, getSynthView, listSynthViews } from "@/lib/synths/synth-service";

const PNG_800x400 = (() => {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 800);
  view.setUint32(20, 400);
  return bytes;
})();

const SLUG = "new-synth";

/** A database with an owner's new synth (unapproved), plus another user and an admin. */
async function setup() {
  const handle = createDatabase("memory://");
  await ensureDatabase(handle);
  const db = handle.db;
  const uploadRoot = mkdtempSync(path.join(tmpdir(), "approval-up-"));
  const storage = new LocalFsStorage(uploadRoot, mkdtempSync(path.join(tmpdir(), "approval-tmp-")));
  const owner = { id: randomUUID(), role: "user" };
  const stranger = { id: randomUUID(), role: "user" };
  const admin = { id: randomUUID(), role: "admin" };
  await db.insert(user).values([
    { id: owner.id, name: "Olga Owner", email: "olga@example.test", emailVerified: true },
    { id: stranger.id, name: "Stan", email: "stan@example.test", emailVerified: true },
    { id: admin.id, name: "Ada", email: "ada@example.test", emailVerified: true, role: "admin" },
  ]);
  const panel = await storePanelUpload({ db, storage }, owner, PNG_800x400);
  if (!panel.ok) throw new Error("upload failed");
  const created = await createSynth(db, owner, {
    displayName: "New Synth",
    slug: SLUG,
    panelAssetId: panel.panel.id,
    controls: [{ id: "knob-1a2b3c4d", kind: "knob", label: "Knob 1", x: 100, y: 100 }],
  });
  if (!created.ok) throw new Error("synth failed");
  const panelFile = path.join(uploadRoot, panel.panel.url.split("/").pop()!);
  return { db, storage, uploadRoot, panelId: panel.panel.id, panelFile, owner, stranger, admin, cleanup: () => handle.client.close() };
}

const slugsFor = async (env: Awaited<ReturnType<typeof setup>>, viewer: { id: string; role: string } | null) =>
  (await listSynthViews(env.db, viewer)).map((view) => view.slug);

describe("a new synth before approval", () => {
  it("starts unapproved, also when an admin creates it", async () => {
    const env = await setup();
    expect((await findSynthBySlug(env.db, SLUG))?.approvedAt).toBeNull();
    expect((await getSynthView(env.db, SLUG, env.owner))?.approved).toBe(false);
    env.cleanup();
  });

  it("is visible to its owner and admins only", async () => {
    const env = await setup();
    expect(await slugsFor(env, env.owner)).toContain(SLUG);
    expect(await slugsFor(env, env.admin)).toContain(SLUG);
    expect(await slugsFor(env, env.stranger)).not.toContain(SLUG);
    expect(await slugsFor(env, null)).not.toContain(SLUG);
    expect(await getSynthView(env.db, SLUG, env.stranger)).toBeNull();
    expect(await getSynthView(env.db, SLUG, null)).toBeNull();
    env.cleanup();
  });

  it("keeps its patches out of public lists and links, but not from its owner", async () => {
    const env = await setup();
    const created = await createPatch(env.db, env.owner, { synthSlug: SLUG, name: "Public", visibility: "public" });
    if (!created.ok) throw new Error("patch failed");
    expect(await getPatchView(env.db, null, created.id)).toBeNull();
    expect(await getPatchView(env.db, env.stranger, created.id)).toBeNull();
    expect(await listPublicPatches(env.db, {})).toEqual([]);
    expect((await getPatchView(env.db, env.owner, created.id))?.name).toBe("Public");
    expect((await listOwnPatchStates(env.db, env.owner, SLUG)).map((state) => state.id)).toContain(created.id);
    // Others cannot add patches to a synth they cannot see.
    expect(await createPatch(env.db, env.stranger, { synthSlug: SLUG, name: "Mine" })).toEqual({ ok: false, error: "synth-not-found" });
    env.cleanup();
  });
});

describe("approving", () => {
  it("makes the synth and its public patches visible to everyone, and taking it back hides them again", async () => {
    const env = await setup();
    const created = await createPatch(env.db, env.owner, { synthSlug: SLUG, name: "Public", visibility: "public" });
    if (!created.ok) throw new Error("patch failed");

    expect(await setApproval(env.db, env.admin, SLUG, true)).toEqual({ ok: true, approved: true });
    expect(await slugsFor(env, null)).toContain(SLUG);
    expect((await getSynthView(env.db, SLUG, env.stranger))?.approved).toBe(true);
    expect((await listPublicPatches(env.db, {})).map((patch) => patch.id)).toEqual([created.id]);

    expect(await setApproval(env.db, env.admin, SLUG, false)).toEqual({ ok: true, approved: false });
    expect(await slugsFor(env, null)).not.toContain(SLUG);
    expect(await listPublicPatches(env.db, {})).toEqual([]);
    env.cleanup();
  });

  it("is for admins only and not for built-in or unknown synths", async () => {
    const env = await setup();
    expect(await setApproval(env.db, env.owner, SLUG, true)).toEqual({ ok: false, error: "forbidden" });
    expect(await setApproval(env.db, null, SLUG, true)).toEqual({ ok: false, error: "forbidden" });
    expect(await setApproval(env.db, env.admin, behringerProton.id, false)).toEqual({ ok: false, error: "not-found" });
    expect(await setApproval(env.db, env.admin, "nope", true)).toEqual({ ok: false, error: "not-found" });
    expect((await findSynthBySlug(env.db, SLUG))?.approvedAt).toBeNull();
    env.cleanup();
  });

  it("lists every synth with its creator for admins, and nothing for others", async () => {
    const env = await setup();
    expect(await listSynthsForAdminArea(env.db, env.owner)).toBeNull();
    const items = await listSynthsForAdminArea(env.db, env.admin);
    expect(items?.find((item) => item.slug === SLUG)).toMatchObject({
      displayName: "New Synth",
      owner: { name: "Olga Owner", email: "olga@example.test" },
      approved: false,
      revision: 1,
    });
    // The built-in synth comes approved with the app.
    expect(items?.find((item) => item.slug === behringerProton.id)).toMatchObject({ owner: null, approved: true });
    env.cleanup();
  });
});

describe("editing other users' synths", () => {
  const revision = (displayName: string) => ({
    displayName,
    slug: SLUG,
    expectedRevision: 1,
    controls: [{ id: "knob-1a2b3c4d", kind: "knob", label: "Knob 1", x: 120, y: 100 }],
  });

  it("lets admins save revisions; the synth stays its owner's", async () => {
    const env = await setup();
    expect((await getSynthView(env.db, SLUG, env.admin))?.canEdit).toBe(true);
    expect(await createSynthRevision(env.db, env.admin, SLUG, revision("Fixed by admin"))).toEqual({ ok: true, slug: SLUG, revision: 2 });
    const view = await getSynthView(env.db, SLUG, env.owner);
    expect(view).toMatchObject({ displayName: "Fixed by admin", revision: 2, ownerId: env.owner.id, canEdit: true });
    env.cleanup();
  });

  it("keeps other users out, also of approved synths", async () => {
    const env = await setup();
    await setApproval(env.db, env.admin, SLUG, true);
    expect((await getSynthView(env.db, SLUG, env.stranger))?.canEdit).toBe(false);
    expect(await createSynthRevision(env.db, env.stranger, SLUG, revision("Hijacked"))).toEqual({ ok: false, error: "not-found" });
    expect(await deleteSynth(env.db, env.stranger, SLUG)).toEqual({ ok: false, error: "not-found" });
    env.cleanup();
  });

  it("lets admins delete a user's synth", async () => {
    const env = await setup();
    expect(await deleteSynth(env.db, env.admin, SLUG)).toEqual({ ok: true });
    expect(await getSynthView(env.db, SLUG, env.owner)).toBeNull();
    env.cleanup();
  });
});

describe("synth policy", () => {
  const unapproved = { ownerId: "a", approvedAt: null };
  it("lets owners and admins see and edit unapproved synths", () => {
    expect(canSeeSynth({ id: "a" }, unapproved)).toBe(true);
    expect(canSeeSynth({ id: "z", role: "admin" }, unapproved)).toBe(true);
    expect(canSeeSynth({ id: "b" }, unapproved)).toBe(false);
    expect(canSeeSynth(null, unapproved)).toBe(false);
    expect(canSeeSynth(null, { ownerId: "a", approvedAt: new Date() })).toBe(true);
    expect(canEditSynth({ id: "z", role: "admin" }, { ownerId: "a" })).toBe(true);
    expect(canEditSynth({ id: "z", role: "admin" }, { ownerId: null })).toBe(false);
  });
});

describe("deleting and restoring", () => {
  it("hides a deleted synth everywhere and brings it back on restore, for admins only", async () => {
    const env = await setup();
    await setApproval(env.db, env.admin, SLUG, true);
    expect(await setDeleted(env.db, env.owner, SLUG, true)).toEqual({ ok: false, error: "forbidden" });
    expect(await setDeleted(env.db, env.admin, SLUG, true)).toEqual({ ok: true, deleted: true });
    expect(await getSynthView(env.db, SLUG, env.owner)).toBeNull();
    expect((await listSynthsForAdminArea(env.db, env.admin))?.find((item) => item.slug === SLUG)).toMatchObject({ deleted: true });
    // The approval can be taken back while deleted, so the synth comes back unapproved.
    expect(await setApproval(env.db, env.admin, SLUG, false)).toEqual({ ok: true, approved: false });
    expect((await listSynthsForAdminArea(env.db, env.admin))?.find((item) => item.slug === SLUG)).toMatchObject({ deleted: true, approved: false });

    expect(await setDeleted(env.db, env.admin, SLUG, false)).toEqual({ ok: true, deleted: false });
    expect(await getSynthView(env.db, SLUG, null)).toBeNull();
    expect((await getSynthView(env.db, SLUG, env.owner))?.approved).toBe(false);
    // Asking again for the state it already has is fine.
    expect(await setDeleted(env.db, env.admin, SLUG, false)).toEqual({ ok: true, deleted: false });
    expect(await setDeleted(env.db, env.admin, behringerProton.id, true)).toEqual({ ok: false, error: "not-found" });
    env.cleanup();
  });
});

describe("deleting for good", () => {
  it("only works for deleted synths and removes every user's patches, the revisions and the panel file", async () => {
    const env = await setup();
    await setApproval(env.db, env.admin, SLUG, true);
    const own = await createPatch(env.db, env.owner, { synthSlug: SLUG, name: "Own" });
    const foreign = await createPatch(env.db, env.stranger, { synthSlug: SLUG, name: "Foreign", visibility: "public", tags: ["Bass"] });
    if (!own.ok || !foreign.ok) throw new Error("patch failed");
    expect((await listSynthsForAdminArea(env.db, env.admin))?.find((item) => item.slug === SLUG)).toMatchObject({ patchCount: 2, patchOwnerCount: 2 });

    const deps = { db: env.db, storage: env.storage };
    expect(await purgeSynth(deps, env.admin, SLUG)).toEqual({ ok: false, error: "not-deleted" });
    await setDeleted(env.db, env.admin, SLUG, true);
    expect(await purgeSynth(deps, env.owner, SLUG)).toEqual({ ok: false, error: "forbidden" });
    expect(existsSync(env.panelFile)).toBe(true);

    const synthId = (await findSynthBySlug(env.db, SLUG))!.id;
    expect(await purgeSynth(deps, env.admin, SLUG)).toEqual({ ok: true });
    expect(await findSynthBySlug(env.db, SLUG)).toBeNull();
    expect(await getPatchView(env.db, env.stranger, foreign.id)).toBeNull();
    expect((await env.db.select().from(patches)).map((row) => row.id)).not.toEqual(expect.arrayContaining([own.id, foreign.id]));
    expect((await env.db.select().from(synthRevisions)).filter((row) => row.synthId === synthId)).toEqual([]);
    expect((await env.db.select().from(assets)).map((row) => row.id)).not.toContain(env.panelId);
    expect(existsSync(env.panelFile)).toBe(false);
    // The built-in synth is untouched; the identifier is free again.
    expect(await getSynthView(env.db, behringerProton.id, null)).not.toBeNull();
    expect(await purgeSynth(deps, env.admin, SLUG)).toEqual({ ok: false, error: "not-found" });
    env.cleanup();
  });
});

describe("reducing revisions", () => {
  it("keeps the newest three, the current one and every revision a patch uses, and drops panels only removed ones showed", async () => {
    const env = await setup();
    const otherPanel = await storePanelUpload({ db: env.db, storage: env.storage }, env.owner, PNG_800x400);
    if (!otherPanel.ok) throw new Error("upload failed");
    const otherPanelFile = path.join(env.uploadRoot, otherPanel.panel.url.split("/").pop()!);
    const save = async (expectedRevision: number, panelAssetId?: string) => {
      const result = await createSynthRevision(env.db, env.owner, SLUG, {
        displayName: "New Synth",
        slug: SLUG,
        expectedRevision,
        ...(panelAssetId ? { panelAssetId } : {}),
        controls: [{ id: "knob-1a2b3c4d", kind: "knob", label: "Knob 1", x: 100 + expectedRevision, y: 100 }],
      });
      if (!result.ok) throw new Error(`revision ${expectedRevision + 1} failed`);
    };
    await save(1); // 2
    const pinned = await createPatch(env.db, env.stranger, { synthSlug: SLUG, name: "On revision 2" });
    expect(pinned).toEqual({ ok: false, error: "synth-not-found" }); // not approved yet: others cannot add patches
    const ownPinned = await createPatch(env.db, env.owner, { synthSlug: SLUG, name: "On revision 2" });
    if (!ownPinned.ok) throw new Error("patch failed");
    await save(2, otherPanel.panel.id); // 3, other panel
    await save(3, env.panelId); // 4, back to the first panel
    for (const expected of [4, 5, 6]) await save(expected); // 5, 6, 7

    const item = (await listSynthsForAdminArea(env.db, env.admin))?.find((entry) => entry.slug === SLUG);
    expect(item).toMatchObject({ revision: 7, storedRevisions: 7, removableRevisions: 3 });
    const deps = { db: env.db, storage: env.storage };
    expect(await reduceRevisions(deps, env.owner, SLUG)).toEqual({ ok: false, error: "forbidden" });
    expect(await reduceRevisions(deps, env.admin, SLUG)).toEqual({ ok: true, removed: 3 });

    const synth = await findSynthBySlug(env.db, SLUG);
    const left = (await env.db.select().from(synthRevisions)).filter((row) => row.synthId === synth!.id).map((row) => row.number).sort((a, b) => a - b);
    expect(left).toEqual([2, 5, 6, 7]);
    expect(existsSync(otherPanelFile)).toBe(false);
    expect(existsSync(env.panelFile)).toBe(true);
    // The patch still opens with its own revision; nothing more to remove.
    expect((await getPatchView(env.db, env.owner, ownPinned.id))?.name).toBe("On revision 2");
    expect(await reduceRevisions(deps, env.admin, SLUG)).toEqual({ ok: true, removed: 0 });
    expect((await listSynthsForAdminArea(env.db, env.admin))?.find((entry) => entry.slug === SLUG)).toMatchObject({ revision: 7, storedRevisions: 4, removableRevisions: 0 });
    env.cleanup();
  });
});

