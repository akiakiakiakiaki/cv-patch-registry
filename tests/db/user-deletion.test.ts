import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { storePanelUpload } from "@/lib/assets/asset-service";
import { createDatabase, ensureDatabase } from "@/lib/db/client";
import { account, assets, patchSamples, patches, session, synths, user, verification } from "@/lib/db/schema";
import { canDeleteUser } from "@/lib/domain/policy";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import type { MailContent } from "@/lib/mail/mail-templates";
import type { Mailer } from "@/lib/mail/mailer";
import { createPatch } from "@/lib/patches/patch-service";
import { findUserById } from "@/lib/repositories/users-repository";
import { LocalFsStorage } from "@/lib/storage/local-fs-storage";
import { createSynth } from "@/lib/synths/synth-service";
import { deleteUserForGood, listUsersForAdminArea } from "@/lib/users/user-admin";

const PNG_800x400 = (() => {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 800);
  view.setUint32(20, 400);
  return bytes;
})();

const owner = { id: "owner", role: "owner" as const };
const KEYS = { "private-take": "11111111-1111-4111-8111-111111111111.mp3", "public-take": "22222222-2222-4222-8222-222222222222.mp3" } as const;
const admin = { id: "admin", role: "admin" as const };

/** Uwe (deactivated) with a private and a public patch, each with a sample, a synth, an unused upload and sign-in data. */
async function setup() {
  const handle = createDatabase("memory://");
  await ensureDatabase(handle);
  const db = handle.db;
  const storage = new LocalFsStorage(mkdtempSync(path.join(tmpdir(), "user-delete-")), mkdtempSync(path.join(tmpdir(), "user-delete-tmp-")));
  await db.insert(user).values([
    { id: "owner", name: "Olli", email: "owner@example.test", emailVerified: true, role: "owner" },
    { id: "admin", name: "Ada", email: "admin@example.test", emailVerified: true, role: "admin" },
    { id: "uwe", name: "Uwe", email: "uwe@example.test", emailVerified: true, disabledAt: new Date() },
  ]);
  await db.insert(account).values({ id: "acc", accountId: "uwe", providerId: "credential", userId: "uwe", password: "secret-hash" });
  await db.insert(session).values({ id: "s1", token: "session-token", userId: "uwe", expiresAt: new Date(Date.now() + 3_600_000), userAgent: "Firefox" });
  await db.insert(verification).values({ id: "v1", identifier: "reset-password:abc", value: "uwe", expiresAt: new Date(Date.now() + 3_600_000) });

  const priv = await createPatch(db, { id: "uwe" }, { synthSlug: behringerProton.id, name: "Secret", tags: ["Acid"] });
  const pub = await createPatch(db, { id: "uwe" }, { synthSlug: behringerProton.id, name: "Shared", visibility: "public" });
  if (!priv.ok || !pub.ok) throw new Error("patch failed");
  for (const [patchId, assetId] of [[priv.id, "private-take"], [pub.id, "public-take"]] as const) {
    await db.insert(assets).values({ id: assetId, ownerId: "uwe", kind: "sample", mime: "audio/mpeg", byteSize: 3, sha256: assetId, storageKey: KEYS[assetId] });
    await storage.putAt(KEYS[assetId], new Uint8Array([1, 2, 3]));
    await db.insert(patchSamples).values({ patchId, assetId, title: assetId, license: "CC0", rightsConfirmedAt: new Date() });
  }
  const panel = await storePanelUpload({ db, storage }, { id: "uwe" }, PNG_800x400);
  const unused = await storePanelUpload({ db, storage }, { id: "uwe" }, PNG_800x400);
  if (!panel.ok || !unused.ok) throw new Error("upload failed");
  await createSynth(db, { id: "uwe" }, { displayName: "Uwe Synth", slug: "uwe-synth", panelAssetId: panel.panel.id, controls: [] });

  const sent: Array<{ to: { email: string }; content: MailContent }> = [];
  const mailer: Mailer = { send: vi.fn(async (to, content) => void sent.push({ to, content })) };
  const removed = vi.spyOn(storage, "remove");
  return { db, storage, mailer, sent, removed, privateId: priv.id, publicId: pub.id, unusedPanelId: unused.panel.id, cleanup: () => handle.client.close() };
}

describe("deleting an account for good", () => {
  it("is only for deactivated accounts the admin may manage", async () => {
    const env = await setup();
    expect(canDeleteUser(admin, { id: "uwe", role: "user", disabledAt: new Date() })).toBe(true);
    expect(canDeleteUser(admin, { id: "uwe", role: "user", disabledAt: null })).toBe(false);
    expect(canDeleteUser(admin, { id: "a2", role: "admin", disabledAt: new Date() })).toBe(false);
    expect(await deleteUserForGood(env, { id: "uwe", role: "user" }, "admin", "en")).toEqual({ ok: false, error: "forbidden" });
    expect(await deleteUserForGood(env, admin, "owner", "en")).toEqual({ ok: false, error: "forbidden" });
    expect(await deleteUserForGood(env, admin, "nobody", "en")).toEqual({ ok: false, error: "not-found" });
    await env.db.update(user).set({ disabledAt: null }).where(eq(user.id, "uwe"));
    expect(await deleteUserForGood(env, admin, "uwe", "en")).toEqual({ ok: false, error: "not-deactivated" });
    expect(env.mailer.send).not.toHaveBeenCalled();
    await env.cleanup();
  });

  it("first mails the user everything stored about them, without secrets", async () => {
    const env = await setup();
    expect(await deleteUserForGood(env, admin, "uwe", "de")).toEqual({ ok: true });
    expect(env.sent).toHaveLength(1);
    const { to, content } = env.sent[0]!;
    expect(to.email).toBe("uwe@example.test");
    expect(content.subject).toBe("Dein Konto wird gelöscht");
    const file = content.attachments![0]!;
    expect(file.name).toMatch(/^cv-patch-registry-\d{4}-\d{2}-\d{2}\.zip$/);
    const entries = unzipSync(file.content);
    expect(Object.keys(entries)).toEqual([file.name.replace(/\.zip$/, ".json")]);
    const text = strFromU8(Object.values(entries)[0]!);
    const data = JSON.parse(text) as {
      user: Record<string, unknown>;
      signInMethods: Array<{ providerId: string }>;
      sessions: Array<{ userAgent: string }>;
      patches: Array<{ name: string; visibility: string; tags: string[]; sample: { title: string } | null }>;
      synths: Array<{ slug: string; revisions: unknown[] }>;
      uploads: unknown[];
    };
    // The whole row, so columns added later come along.
    expect(Object.keys(data.user).sort()).toEqual(Object.keys((await env.db.select().from(user).limit(1))[0]!).sort());
    expect(data.user).toMatchObject({ id: "uwe", name: "Uwe", email: "uwe@example.test" });
    expect(data.signInMethods).toEqual([expect.objectContaining({ providerId: "credential" })]);
    expect(data.sessions).toEqual([expect.objectContaining({ userAgent: "Firefox" })]);
    expect(data.patches.map((patch) => [patch.name, patch.visibility, patch.sample?.title])).toEqual([
      ["Secret", "private", "private-take"],
      ["Shared", "public", "public-take"],
    ]);
    expect(data.patches[0]!.tags).toEqual(["acid"]);
    expect(data.synths).toEqual([expect.objectContaining({ slug: "uwe-synth", revisions: [expect.objectContaining({ number: 1 })] })]);
    expect(data.uploads).toHaveLength(4);
    expect(text).not.toContain("secret-hash");
    expect(text).not.toContain("session-token");
    await env.cleanup();
  });

  it("removes private data and keeps what others use under a cleared account", async () => {
    const env = await setup();
    await deleteUserForGood(env, admin, "uwe", "en");

    const remaining = await env.db.select().from(patches).where(eq(patches.ownerId, "uwe"));
    expect(remaining.map((patch) => patch.id)).toEqual([env.publicId]);
    expect((await env.db.select().from(synths).where(eq(synths.slug, "uwe-synth")))[0]?.ownerId).toBe("uwe");
    const uploads = (await env.db.select({ id: assets.id }).from(assets).where(eq(assets.ownerId, "uwe"))).map((row) => row.id);
    expect(uploads).toContain("public-take");
    expect(uploads).not.toContain("private-take");
    expect(uploads).not.toContain(env.unusedPanelId);
    expect(uploads).toHaveLength(2);
    expect(env.removed).toHaveBeenCalledWith(KEYS["private-take"]);
    expect(env.removed).toHaveBeenCalledTimes(2);

    expect(await env.db.select().from(session).where(eq(session.userId, "uwe"))).toEqual([]);
    expect(await env.db.select().from(account).where(eq(account.userId, "uwe"))).toEqual([]);
    expect(await env.db.select().from(verification)).toEqual([]);

    const cleared = await findUserById(env.db, "uwe");
    expect(cleared).toMatchObject({ name: "", email: "deleted-uwe@deleted.invalid", emailVerified: false, image: null, role: "user" });
    expect(cleared?.deletedAt).toBeInstanceOf(Date);
    expect(cleared?.disabledAt).toBeInstanceOf(Date);
    expect((await listUsersForAdminArea(env.db, owner))!.map((item) => item.id)).not.toContain("uwe");
    expect(await deleteUserForGood(env, admin, "uwe", "en")).toEqual({ ok: false, error: "not-found" });
    await env.cleanup();
  });

  it("removes the account row too when nothing points at it anymore", async () => {
    const env = await setup();
    await env.db.delete(patches).where(eq(patches.id, env.publicId));
    await env.db.delete(synths).where(eq(synths.slug, "uwe-synth"));
    expect(await deleteUserForGood(env, admin, "uwe", "en")).toEqual({ ok: true });
    expect(await findUserById(env.db, "uwe")).toBeNull();
    expect(await env.db.select().from(assets).where(eq(assets.ownerId, "uwe"))).toEqual([]);
    await env.cleanup();
  });

  it("deletes nothing when the mail with the data cannot be sent", async () => {
    const env = await setup();
    vi.mocked(env.mailer.send).mockRejectedValueOnce(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await deleteUserForGood(env, admin, "uwe", "en")).toEqual({ ok: false, error: "mail-failed" });
    expect(await findUserById(env.db, "uwe")).toMatchObject({ name: "Uwe", deletedAt: null });
    expect(await env.db.select().from(patches).where(eq(patches.ownerId, "uwe"))).toHaveLength(2);
    expect(env.removed).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    await env.cleanup();
  });
});
