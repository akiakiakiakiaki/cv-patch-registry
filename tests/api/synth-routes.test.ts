// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; role: "user" | "admin" } | null }));
const storageRoot = vi.hoisted(() => ({ dir: "" }));

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => session.user,
}));

vi.mock("@/lib/storage", async () => {
  const { LocalFsStorage } = await import("@/lib/storage/local-fs-storage");
  const getStorage = () => new LocalFsStorage(storageRoot.dir, storageRoot.dir);
  return { getStorage, storagePublicUrl: (storageKey: string) => getStorage().publicUrl(storageKey) };
});

const PNG_800x400 = (() => {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 800);
  view.setUint32(20, 400);
  return bytes;
})();

const owner = { id: randomUUID(), role: "user" as const };
const stranger = { id: randomUUID(), role: "user" as const };
const admin = { id: randomUUID(), role: "admin" as const };

const assetsRoute = () => import("@/app/api/assets/route");
const synthsRoute = () => import("@/app/api/synths/route");
const synthRoute = () => import("@/app/api/synths/[slug]/route");
const revisionRoute = () => import("@/app/api/synths/[slug]/revisions/route");
const adminSynthRoute = () => import("@/app/api/admin/synths/[slug]/route");

function uploadRequest(bytes: Uint8Array, kind = "panel") {
  return new Request(`http://localhost/api/assets?kind=${kind}`, { method: "POST", body: bytes });
}

function jsonRequest(method: string, body: unknown) {
  return new Request("http://localhost/api/synths", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function uploadPanel(): Promise<string> {
  const response = await (await assetsRoute()).POST(uploadRequest(PNG_800x400));
  const body = (await response.json()) as { panel: { id: string } };
  return body.panel.id;
}

beforeAll(async () => {
  process.env.PATCH_DB_DIR = "memory://";
  storageRoot.dir = mkdtempSync(path.join(tmpdir(), "route-uploads-"));
  const { serverDatabase } = await import("@/lib/db/server");
  const { getDatabase } = await import("@/lib/db/client");
  const { user } = await import("@/lib/db/schema");
  await serverDatabase();
  await getDatabase().db.insert(user).values([
    { id: owner.id, name: "Owner", email: `${owner.id}@example.test`, emailVerified: true },
    { id: stranger.id, name: "Stranger", email: `${stranger.id}@example.test`, emailVerified: true },
  ]);
});

beforeEach(() => {
  session.user = owner;
});

describe("authentication", () => {
  it("answers 401 to anonymous uploads and synth writes", async () => {
    session.user = null;
    expect((await (await assetsRoute()).POST(uploadRequest(PNG_800x400))).status).toBe(401);
    expect((await (await synthsRoute()).POST(jsonRequest("POST", {}))).status).toBe(401);
  });
});

describe("panel uploads", () => {
  it("stores a PNG and returns its public URL and size", async () => {
    const response = await (await assetsRoute()).POST(uploadRequest(PNG_800x400));
    expect(response.status).toBe(201);
    const body = (await response.json()) as { panel: { url: string; width: number; height: number } };
    expect(body.panel).toMatchObject({ width: 800, height: 400 });
    expect(body.panel.url).toMatch(/^\/assets\/uploads\/[0-9a-f-]{36}\.png$/);
  });

  it("rejects an unknown upload kind", async () => {
    expect((await (await assetsRoute()).POST(uploadRequest(PNG_800x400, "sample"))).status).toBe(400);
  });

  it("answers 413 for bodies above the size limit", async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    expect((await (await assetsRoute()).POST(uploadRequest(big))).status).toBe(413);
  });

  it("answers 422 for a malicious SVG", async () => {
    const malicious = new TextEncoder().encode('<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>');
    const response = await (await assetsRoute()).POST(uploadRequest(malicious));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "unsupported-content" });
  });
});

describe("synth lifecycle over HTTP", () => {
  const slug = `route-${Date.now()}`;

  it("creates a synth that only its owner sees until an admin approves it, then everyone", async () => {
    const panelAssetId = await uploadPanel();
    const created = await (await synthsRoute()).POST(
      jsonRequest("POST", {
        displayName: "Route Synth",
        slug,
        panelAssetId,
        controls: [{ id: "knob-1a2b3c4d", kind: "knob", label: "Knob 1", x: 100, y: 100 }],
      }),
    );
    expect(created.status).toBe(201);

    const detail = async () => (await synthRoute()).GET(new Request(`http://localhost/api/synths/${slug}`), { params: Promise.resolve({ slug }) });
    const listed = async () => ((await (await (await synthsRoute()).GET()).json()) as { synths: { slug: string; approved: boolean }[] }).synths;
    expect(await (await detail()).json()).toMatchObject({ slug, revision: 1, isBuiltIn: false, approved: false, canEdit: true });
    expect((await listed()).find((synth) => synth.slug === slug)).toMatchObject({ approved: false });

    for (const viewer of [null, stranger]) {
      session.user = viewer;
      expect((await detail()).status).toBe(404);
      expect((await listed()).map((synth) => synth.slug)).not.toContain(slug);
    }

    session.user = admin;
    const approval = await (await adminSynthRoute()).PATCH(jsonRequest("PATCH", { approved: true }), { params: Promise.resolve({ slug }) });
    expect(await approval.json()).toEqual({ ok: true, approved: true });
    expect(await (await detail()).json()).toMatchObject({ approved: true, canEdit: true });

    session.user = null;
    expect(await (await detail()).json()).toMatchObject({ slug, approved: true, canEdit: false });
    expect((await listed()).map((synth) => synth.slug)).toContain(slug);
  });

  it("answers 404 for unknown slugs", async () => {
    const response = await (await synthRoute()).GET(new Request("http://localhost/x"), {
      params: Promise.resolve({ slug: "does-not-exist" }),
    });
    expect(response.status).toBe(404);
  });

  it("answers 422 for malformed JSON", async () => {
    const response = await (await synthsRoute()).POST(new Request("http://localhost/api/synths", { method: "POST", body: "{nope" }));
    expect(response.status).toBe(422);
  });

  it("saves a revision for the owner and answers 409 for a stale one", async () => {
    const body = { displayName: "Route Synth 2", slug, expectedRevision: 1, controls: [] };
    const first = await (await revisionRoute()).POST(jsonRequest("POST", body), { params: Promise.resolve({ slug }) });
    expect(first.status).toBe(201);
    const stale = await (await revisionRoute()).POST(jsonRequest("POST", body), { params: Promise.resolve({ slug }) });
    expect(stale.status).toBe(409);
  });

  it("answers 404 when someone else tries to save a revision", async () => {
    session.user = stranger;
    const response = await (await revisionRoute()).POST(
      jsonRequest("POST", { displayName: "Hijack", slug, expectedRevision: 2, controls: [] }),
      { params: Promise.resolve({ slug }) },
    );
    expect(response.status).toBe(404);
  });
});

describe("synth approval over HTTP", () => {
  // The permission and input checks come before the synth is looked up, so any slug will do.
  const slug = "any-synth";
  const approve = async (body: unknown, target = slug) =>
    (await adminSynthRoute()).PATCH(jsonRequest("PATCH", body), { params: Promise.resolve({ slug: target }) });

  it("is for admins only", async () => {
    session.user = null;
    expect((await approve({ approved: true })).status).toBe(401);
    session.user = owner;
    expect((await approve({ approved: true })).status).toBe(403);
  });

  it("checks the request and the synth", async () => {
    session.user = admin;
    expect((await approve({ approved: "yes" })).status).toBe(422);
    expect((await approve({ approved: true }, "does-not-exist")).status).toBe(404);
  });

  it("refuses requests from other sites", async () => {
    session.user = admin;
    const request = new Request("http://localhost/api/admin/synths/x", {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ approved: true }),
    });
    expect((await (await adminSynthRoute()).PATCH(request, { params: Promise.resolve({ slug }) })).status).toBe(403);
  });
});

describe("synth management over HTTP", () => {
  const slug = "any-synth";
  const context = { params: Promise.resolve({ slug }) };
  const request = (method: string, body?: unknown) =>
    new Request(`http://localhost/api/admin/synths/${slug}`, {
      method,
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });

  it("accepts one change per request", async () => {
    session.user = admin;
    const route = await adminSynthRoute();
    expect((await route.PATCH(request("PATCH", { approved: true, deleted: true }), context)).status).toBe(422);
    expect((await route.PATCH(request("PATCH", { deleted: "yes" }), context)).status).toBe(422);
    expect((await route.PATCH(request("PATCH", { deleted: true }), context)).status).toBe(404);
  });

  it("keeps deleting for good and reducing revisions for admins", async () => {
    const route = await adminSynthRoute();
    const revisions = await import("@/app/api/admin/synths/[slug]/revisions/route");
    session.user = null;
    expect((await route.DELETE(request("DELETE"), context)).status).toBe(401);
    expect((await revisions.DELETE(request("DELETE"), context)).status).toBe(401);
    session.user = owner;
    expect((await route.DELETE(request("DELETE"), context)).status).toBe(403);
    expect((await revisions.DELETE(request("DELETE"), context)).status).toBe(403);
    session.user = admin;
    expect((await route.DELETE(request("DELETE"), context)).status).toBe(404);
  });
});

describe("creating a synth notifies admins", () => {
  it("mails every admin, and still creates the synth when the mail fails", async () => {
    const { ConsoleMailProvider } = await import("@/lib/mail/providers/console-mail-provider");
    const { getDatabase } = await import("@/lib/db/client");
    const { user } = await import("@/lib/db/schema");
    await getDatabase().db.insert(user).values({ id: admin.id, name: "Admin", email: `${admin.id}@example.test`, emailVerified: true, role: "admin" }).onConflictDoNothing();
    const send = vi.spyOn(ConsoleMailProvider.prototype, "send").mockRejectedValueOnce(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    session.user = owner;
    const created = await (await synthsRoute()).POST(
      jsonRequest("POST", { displayName: "Mailed Synth", slug: "mailed-synth", panelAssetId: await uploadPanel(), controls: [] }),
    );
    expect(created.status).toBe(201);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: expect.objectContaining({ email: `${admin.id}@example.test` }), subject: "New synth awaits approval: Mailed Synth" }),
      expect.anything(),
    );
    expect(send.mock.calls[0]![0].text).toContain("http://localhost/admin/synths");
    vi.restoreAllMocks();
  });
});

