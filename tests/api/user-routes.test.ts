// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; role: string } | null }));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => session.user }));

const owner = { id: "route-owner", role: "owner" };
const admin = { id: "route-admin", role: "admin" };
const member = { id: "route-member", role: "user" };
const leaver = { id: "route-leaver", role: "user" };

beforeAll(async () => {
  process.env.PATCH_DB_DIR = "memory://";
  const { serverDatabase } = await import("@/lib/db/server");
  const { getDatabase } = await import("@/lib/db/client");
  const { user } = await import("@/lib/db/schema");
  await serverDatabase();
  await getDatabase().db.insert(user).values(
    [owner, admin, member, leaver].map((account) => ({ ...account, role: account.role as "user" | "admin" | "owner", name: account.id, email: `${account.id}@example.test`, emailVerified: false })),
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

describe("deleting accounts over HTTP", () => {
  const remove = async (id: string, origin?: string) =>
    (await route()).DELETE(
      new Request(`http://localhost/api/admin/users/${id}`, {
        method: "DELETE",
        headers: { "accept-language": "de-DE,de;q=0.9", ...(origin ? { origin } : {}) },
      }),
      { params: Promise.resolve({ id }) },
    );

  it("is for admins only, from this site, and only for deactivated accounts", async () => {
    session.user = null;
    expect((await remove(leaver.id)).status).toBe(401);
    session.user = member;
    expect((await remove(leaver.id)).status).toBe(403);
    session.user = admin;
    expect((await remove(owner.id)).status).toBe(403);
    expect((await remove("nobody")).status).toBe(404);
    expect((await remove(leaver.id)).status).toBe(409);
    expect((await remove(leaver.id, "https://evil.example")).status).toBe(403);
  });

  it("answers 502 and keeps the account when the data mail fails, and deletes it once the mail is out", async () => {
    const { ConsoleMailProvider } = await import("@/lib/mail/providers/console-mail-provider");
    const send = vi.spyOn(ConsoleMailProvider.prototype, "send").mockRejectedValueOnce(new Error("down")).mockResolvedValue();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    session.user = admin;
    expect((await patch(leaver.id, { active: false })).status).toBe(200);
    const failed = await remove(leaver.id);
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "mail-failed" });

    expect((await remove(leaver.id)).status).toBe(204);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: expect.objectContaining({ email: `${leaver.id}@example.test` }), subject: "Dein Konto wird gelöscht" }),
      expect.anything(),
    );
    expect((await remove(leaver.id)).status).toBe(404);
    vi.restoreAllMocks();
  });
});
