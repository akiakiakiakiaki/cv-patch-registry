// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => session.user }));

const owner = { id: randomUUID() };
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02]);
let patchId = "";

const sampleRoute = () => import("@/app/api/patches/[id]/sample/route");

function upload(bytes: Uint8Array, query = "title=Pad&license=CC0&rights=true") {
  return new Request(`http://localhost/api/patches/${patchId}/sample?${query}`, { method: "POST", body: bytes });
}

beforeAll(async () => {
  process.env.PATCH_DB_DIR = "memory://";
  const { serverDatabase } = await import("@/lib/db/server");
  const { getDatabase } = await import("@/lib/db/client");
  const { user } = await import("@/lib/db/schema");
  const { createPatch } = await import("@/lib/patches/patch-service");
  await serverDatabase();
  await getDatabase().db.insert(user).values({ id: owner.id, name: "Owner", email: `${owner.id}@example.test`, emailVerified: true });
  const created = await createPatch(getDatabase().db, owner, { synthSlug: "behringer-proton", name: "Sample host" });
  if (!created.ok) throw new Error("setup failed");
  patchId = created.id;
});

beforeEach(() => {
  session.user = owner;
});

afterEach(() => {
  delete process.env.FEATURE_AUDIO;
});

describe("sample route", () => {
  it("answers 404 while the feature flag is off", async () => {
    process.env.FEATURE_AUDIO = "false";
    expect((await (await sampleRoute()).POST(upload(MP3), { params: Promise.resolve({ id: patchId }) })).status).toBe(404);
  });

  it("answers 401 to anonymous uploads when audio is on", async () => {
    process.env.FEATURE_AUDIO = "true";
    session.user = null;
    expect((await (await sampleRoute()).POST(upload(MP3), { params: Promise.resolve({ id: patchId }) })).status).toBe(401);
  });

  it("accepts an MP3 from the owner and answers 413 for oversize bodies", async () => {
    process.env.FEATURE_AUDIO = "true";
    const stored = await (await sampleRoute()).POST(upload(MP3), { params: Promise.resolve({ id: patchId }) });
    expect(stored.status).toBe(201);

    const big = new Uint8Array(1_500_001);
    big.set(MP3, 0);
    const tooBig = await (await sampleRoute()).POST(upload(big, "title=Big&license=CC0&rights=true"), { params: Promise.resolve({ id: patchId }) });
    expect(tooBig.status).toBe(413);
  });
});
