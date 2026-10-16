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
  return { getStorage: () => new LocalFsStorage(storageRoot.dir, storageRoot.dir) };
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

const assetsRoute = () => import("@/app/api/assets/route");
const synthsRoute = () => import("@/app/api/synths/route");
const synthRoute = () => import("@/app/api/synths/[slug]/route");
const revisionRoute = () => import("@/app/api/synths/[slug]/revisions/route");

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

  it("creates a synth, reads it back publicly and lists it", async () => {
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

    session.user = null;
    const detail = await (await synthRoute()).GET(new Request(`http://localhost/api/synths/${slug}`), {
      params: Promise.resolve({ slug }),
    });
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ slug, revision: 1, isBuiltIn: false });

    const list = await (await synthsRoute()).GET();
    const listed = (await list.json()) as { synths: { slug: string }[] };
    expect(listed.synths.map((synth) => synth.slug)).toContain(slug);
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
