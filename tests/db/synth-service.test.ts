import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDatabase, ensureDatabase, type DatabaseHandle } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { storePanelUpload } from "@/lib/assets/asset-service";
import { LocalFsStorage } from "@/lib/storage/local-fs-storage";
import { createSynth, createSynthRevision, getSynthView, listSynthViews } from "@/lib/synths/synth-service";
import { canEditSynth } from "@/lib/domain/policy";
import { seedBuiltInSynths } from "@/lib/db/seed";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";

const PNG_800x400 = (() => {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 800);
  view.setUint32(20, 400);
  return bytes;
})();

async function setup() {
  const handle: DatabaseHandle = createDatabase("memory://");
  await ensureDatabase(handle);
  const temporary = mkdtempSync(path.join(tmpdir(), "synth-tests-"));
  const storage = new LocalFsStorage(mkdtempSync(path.join(tmpdir(), "synth-uploads-")), temporary);
  const owner = { id: randomUUID() };
  const other = { id: randomUUID() };
  await handle.db.insert(user).values([
    { id: owner.id, name: "Owner", email: `${owner.id}@example.test`, emailVerified: true },
    { id: other.id, name: "Other", email: `${other.id}@example.test`, emailVerified: true },
  ]);
  return { handle, db: handle.db, storage, owner, other, cleanup: () => handle.client.close() };
}

function draft(slug: string, extra: Record<string, unknown> = {}) {
  return {
    displayName: `Synth ${slug}`,
    slug,
    manufacturer: "Test Works",
    controls: [
      { id: "knob-1a2b3c4d", kind: "knob", label: "Knob 1", x: 100, y: 100 },
      { id: "in-1a2b3c51", kind: "in", label: "In 1", x: 700, y: 300 },
    ],
    ...extra,
  };
}

async function uploadPanel(env: Awaited<ReturnType<typeof setup>>, actor: { id: string }) {
  const result = await storePanelUpload({ db: env.db, storage: env.storage }, actor, PNG_800x400);
  if (!result.ok) throw new Error(`upload failed: ${result.reason}`);
  return result.panel;
}

describe("built-in synths", () => {
  it("mirror the Proton layout as revision 1 and stay idempotent", async () => {
    const env = await setup();
    const first = await getSynthView(env.db, behringerProton.layout.id);
    expect(first).toMatchObject({ isBuiltIn: true, revision: 1, displayName: "Behringer Proton", panelUrl: "/proton.svg" });

    await seedBuiltInSynths(env.db);
    const second = await getSynthView(env.db, behringerProton.layout.id);
    expect(second?.revision).toBe(1);
    env.cleanup();
  });

  it("are not editable by any user", async () => {
    const env = await setup();
    const result = await createSynthRevision(env.db, env.owner, behringerProton.layout.id, draft("x", { expectedRevision: 1 }));
    expect(result).toEqual({ ok: false, error: "not-found" });
    env.cleanup();
  });
});

describe("creating synths", () => {
  it("stores the panel asset, creates revision 1 and makes it public", async () => {
    const env = await setup();
    const panel = await uploadPanel(env, env.owner);
    const result = await createSynth(env.db, env.owner, draft("my-synth", { panelAssetId: panel.id }));
    expect(result).toEqual({ ok: true, slug: "my-synth", revision: 1 });

    const view = await getSynthView(env.db, "my-synth");
    expect(view).toMatchObject({ revision: 1, isBuiltIn: false, ownerId: env.owner.id, manufacturer: "Test Works" });
    expect(view?.panelUrl).toMatch(/^\/assets\/uploads\/[0-9a-f-]{36}\.png$/);
    expect(view?.layout.knobs[0]?.id).toBe("knob-1a2b3c4d");
    env.cleanup();
  });

  it("refuses a panel that belongs to someone else", async () => {
    const env = await setup();
    const foreignPanel = await uploadPanel(env, env.other);
    const result = await createSynth(env.db, env.owner, draft("stolen", { panelAssetId: foreignPanel.id }));
    expect(result).toEqual({ ok: false, error: "panel" });
    env.cleanup();
  });

  it("rejects a slug that is already taken", async () => {
    const env = await setup();
    const panel = await uploadPanel(env, env.owner);
    await createSynth(env.db, env.owner, draft("taken", { panelAssetId: panel.id }));
    const again = await createSynth(env.db, env.owner, draft("taken", { panelAssetId: panel.id }));
    expect(again).toEqual({ ok: false, error: "slug-taken" });
    env.cleanup();
  });

  it("rejects an invalid draft with issues", async () => {
    const env = await setup();
    const panel = await uploadPanel(env, env.owner);
    const result = await createSynth(env.db, env.owner, draft("Bad Slug", { panelAssetId: panel.id }));
    expect(result).toMatchObject({ ok: false, error: "invalid" });
    env.cleanup();
  });
});

describe("revisions and optimistic concurrency", () => {
  it("creates revision 2 when the expected revision matches", async () => {
    const env = await setup();
    const panel = await uploadPanel(env, env.owner);
    await createSynth(env.db, env.owner, draft("rev-synth", { panelAssetId: panel.id }));
    const result = await createSynthRevision(env.db, env.owner, "rev-synth", draft("rev-synth", { expectedRevision: 1, displayName: "Renamed" }));
    expect(result).toEqual({ ok: true, slug: "rev-synth", revision: 2 });
    expect((await getSynthView(env.db, "rev-synth"))?.displayName).toBe("Renamed");
    env.cleanup();
  });

  it("answers 409 for a stale expected revision and keeps the newer one", async () => {
    const env = await setup();
    const panel = await uploadPanel(env, env.owner);
    await createSynth(env.db, env.owner, draft("stale-synth", { panelAssetId: panel.id }));
    await createSynthRevision(env.db, env.owner, "stale-synth", draft("stale-synth", { expectedRevision: 1 }));
    const stale = await createSynthRevision(env.db, env.owner, "stale-synth", draft("stale-synth", { expectedRevision: 1, displayName: "Lost" }));
    expect(stale).toEqual({ ok: false, error: "conflict" });
    expect((await getSynthView(env.db, "stale-synth"))?.revision).toBe(2);
    env.cleanup();
  });

  it("answers 404 for a foreign synth, not 403", async () => {
    const env = await setup();
    const panel = await uploadPanel(env, env.owner);
    await createSynth(env.db, env.owner, draft("owned", { panelAssetId: panel.id }));
    const result = await createSynthRevision(env.db, env.other, "owned", draft("owned", { expectedRevision: 1 }));
    expect(result).toEqual({ ok: false, error: "not-found" });
    env.cleanup();
  });

  it("requires expectedRevision for revisions", async () => {
    const env = await setup();
    const panel = await uploadPanel(env, env.owner);
    await createSynth(env.db, env.owner, draft("needs-rev", { panelAssetId: panel.id }));
    const result = await createSynthRevision(env.db, env.owner, "needs-rev", draft("needs-rev"));
    expect(result).toMatchObject({ ok: false, error: "invalid" });
    env.cleanup();
  });
});

describe("catalog listing", () => {
  it("lists built-in and user synths publicly", async () => {
    const env = await setup();
    const panel = await uploadPanel(env, env.owner);
    await createSynth(env.db, env.owner, draft("listed", { panelAssetId: panel.id }));
    const slugs = (await listSynthViews(env.db)).map((view) => view.slug).sort();
    expect(slugs).toEqual([behringerProton.layout.id, "listed"].sort());
    env.cleanup();
  });
});

describe("policy", () => {
  it("allows editing only for the owner of a user synth", () => {
    expect(canEditSynth({ id: "a" }, { ownerId: "a" })).toBe(true);
    expect(canEditSynth({ id: "b" }, { ownerId: "a" })).toBe(false);
    expect(canEditSynth(null, { ownerId: "a" })).toBe(false);
    expect(canEditSynth({ id: "a" }, { ownerId: null })).toBe(false);
  });
});

describe("panel upload service", () => {
  it("rejects a malicious SVG and stores nothing", async () => {
    const env = await setup();
    const malicious = new TextEncoder().encode('<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>');
    const result = await storePanelUpload({ db: env.db, storage: env.storage }, env.owner, malicious);
    expect(result).toEqual({ ok: false, reason: "unsupported-content" });
    env.cleanup();
  });

  it("stores a clean SVG as sanitized text with its size", async () => {
    const env = await setup();
    const result = await storePanelUpload(
      { db: env.db, storage: env.storage },
      env.owner,
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><rect width="3" height="2"/></svg>'),
    );
    expect(result).toMatchObject({ ok: true, panel: { width: 30, height: 20, mime: "image/svg+xml" } });
    env.cleanup();
  });
});

