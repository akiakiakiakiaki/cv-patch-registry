// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; role: "user" | "admin" } | null }));

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => session.user,
}));

const owner = { id: randomUUID(), role: "user" as const };
const stranger = { id: randomUUID(), role: "user" as const };
const PROTON = "behringer-proton";
let patchId = "";

const patchesRoute = () => import("@/app/api/patches/route");
const patchRoute = () => import("@/app/api/patches/[id]/route");
const exploreRoute = () => import("@/app/api/explore/route");

function json(method: string, url: string, body?: unknown) {
  return new Request(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}

beforeAll(async () => {
  process.env.PATCH_DB_DIR = "memory://";
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

describe("patch routes", () => {
  it("answers 401 to anonymous creation", async () => {
    session.user = null;
    const response = await (await patchesRoute()).POST(json("POST", "http://localhost/api/patches", { synthSlug: PROTON, name: "x" }));
    expect(response.status).toBe(401);
  });

  it("rejects cross-origin cookie-authenticated mutations", async () => {
    const request = new Request("http://localhost/api/patches", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example" },
      body: JSON.stringify({ synthSlug: PROTON, name: "Cross-origin" }),
    });
    const response = await (await patchesRoute()).POST(request);
    expect(response.status).toBe(403);
  });

  it("creates a private patch for the owner", async () => {
    const response = await (await patchesRoute()).POST(json("POST", "http://localhost/api/patches", { synthSlug: PROTON, name: "Route patch" }));
    expect(response.status).toBe(201);
    patchId = ((await response.json()) as { id: string }).id;
  });

  it("hides private patches from anonymous visitors and strangers, shows them to the owner", async () => {
    session.user = null;
    const anonymous = await (await patchRoute()).GET(new Request("http://localhost/x"), { params: Promise.resolve({ id: patchId }) });
    expect(anonymous.status).toBe(404);

    session.user = stranger;
    const foreign = await (await patchRoute()).GET(new Request("http://localhost/x"), { params: Promise.resolve({ id: patchId }) });
    expect(foreign.status).toBe(404);

    session.user = owner;
    const own = await (await patchRoute()).GET(new Request("http://localhost/x"), { params: Promise.resolve({ id: patchId }) });
    expect(own.status).toBe(200);
  });

  it("updates with the expected revision and answers 409 for a stale one", async () => {
    const body = { name: "Route patch", visibility: "public", expectedRevision: 1 };
    const updated = await (await patchRoute()).PATCH(json("PATCH", "http://localhost/x", body), { params: Promise.resolve({ id: patchId }) });
    expect(updated.status).toBe(200);
    const stale = await (await patchRoute()).PATCH(json("PATCH", "http://localhost/x", body), { params: Promise.resolve({ id: patchId }) });
    expect(stale.status).toBe(409);
  });

  it("refuses edits and deletes by a stranger with 404", async () => {
    session.user = stranger;
    const edit = await (await patchRoute()).PATCH(json("PATCH", "http://localhost/x", { name: "Hijack", expectedRevision: 2 }), { params: Promise.resolve({ id: patchId }) });
    expect(edit.status).toBe(404);
    const remove = await (await patchRoute()).DELETE(new Request("http://localhost/x", { method: "DELETE" }), { params: Promise.resolve({ id: patchId }) });
    expect(remove.status).toBe(404);
  });

  it("lists the now-public patch in explore without a session", async () => {
    session.user = null;
    const response = await (await exploreRoute()).GET(new Request("http://localhost/api/explore?synth=behringer-proton"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { patches: { id: string }[] };
    expect(body.patches.map((patch) => patch.id)).toContain(patchId);
  });

  it("deletes the owner's patch", async () => {
    const remove = await (await patchRoute()).DELETE(new Request("http://localhost/x", { method: "DELETE" }), { params: Promise.resolve({ id: patchId }) });
    expect(remove.status).toBe(204);
  });
});
