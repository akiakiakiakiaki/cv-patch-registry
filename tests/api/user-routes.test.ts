// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; role: string } | null }));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => session.user }));

const owner = { id: "route-owner", role: "owner" };
const admin = { id: "route-admin", role: "admin" };
const member = { id: "route-member", role: "user" };

beforeAll(async () => {
  process.env.PATCH_DB_DIR = "memory://";
  const { serverDatabase } = await import("@/lib/db/server");
  const { getDatabase } = await import("@/lib/db/client");
  const { user } = await import("@/lib/db/schema");
  await serverDatabase();
  await getDatabase().db.insert(user).values(
    [owner, admin, member].map((account) => ({ ...account, role: account.role as "user" | "admin" | "owner", name: account.id, email: `${account.id}@example.test`, emailVerified: false })),
  );
});

const route = () => import("@/app/api/admin/users/[id]/route");
const patch = async (id: string, body: unknown, origin?: string) =>
  (await route()).PATCH(
    new Request(`http://localhost/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

describe("user management over HTTP", () => {
  it("is for admins only", async () => {
    session.user = null;
    expect((await patch(member.id, { active: false })).status).toBe(401);
    session.user = member;
    expect((await patch(member.id, { active: false })).status).toBe(403);
  });

  it("accepts one change per request and never assigns the owner role", async () => {
    session.user = owner;
    expect((await patch(member.id, { active: false, emailVerified: true })).status).toBe(422);
    expect((await patch(member.id, { role: "owner" })).status).toBe(422);
    expect((await patch("nobody", { active: false })).status).toBe(404);
  });

  it("applies allowed changes and answers with them", async () => {
    session.user = admin;
    const response = await patch(member.id, { emailVerified: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ emailVerified: true });
    expect((await patch(member.id, { role: "admin" })).status).toBe(403);
    expect((await patch(owner.id, { active: false })).status).toBe(403);
  });

  it("refuses requests from other sites", async () => {
    session.user = owner;
    expect((await patch(member.id, { active: false }, "https://evil.example")).status).toBe(403);
  });
});
