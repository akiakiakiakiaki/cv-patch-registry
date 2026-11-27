import { describe, expect, it } from "vitest";
import { createDatabase, ensureDatabase } from "@/lib/db/client";
import { session, user } from "@/lib/db/schema";
import { canChangeRole, canManageUser, isAdmin } from "@/lib/domain/policy";
import { findUserById } from "@/lib/repositories/users-repository";
import { changeUser, listUsersForAdminArea } from "@/lib/users/user-admin";

/** An owner, an admin and two users, one of them with a running session. */
async function setup() {
  const handle = createDatabase("memory://");
  await ensureDatabase(handle);
  const db = handle.db;
  const accounts = [
    { id: "owner", name: "Olli Owner", email: "owner@example.test", role: "owner" as const },
    { id: "admin", name: "Ada Admin", email: "admin@example.test", role: "admin" as const },
    { id: "user", name: "Uwe User", email: "user@example.test", role: "user" as const },
    { id: "other", name: "Otto", email: "other@example.test", role: "user" as const },
  ];
  await db.insert(user).values(accounts.map((account) => ({ ...account, emailVerified: false })));
  await db.insert(session).values({ id: "s1", token: "t1", userId: "user", expiresAt: new Date(Date.now() + 3_600_000) });
  const actor = (id: string) => ({ id, role: accounts.find((account) => account.id === id)!.role });
  return { db, actor, cleanup: () => handle.client.close() };
}

describe("user management rules", () => {
  const owner = { id: "o", role: "owner" };
  const admin = { id: "a", role: "admin" };
  it("treats the owner as an admin", () => {
    expect(isAdmin(owner)).toBe(true);
    expect(isAdmin({ id: "u", role: "user" })).toBe(false);
  });

  it("protects the owner and everyone's own account, and lets only the owner manage admins and roles", () => {
    expect(canManageUser(admin, { id: "u", role: "user" })).toBe(true);
    expect(canManageUser(admin, { id: "a2", role: "admin" })).toBe(false);
    expect(canManageUser(owner, { id: "a2", role: "admin" })).toBe(true);
    expect(canManageUser(admin, { id: "o", role: "owner" })).toBe(false);
    expect(canManageUser(owner, owner)).toBe(false);
    expect(canManageUser(admin, admin)).toBe(false);
    expect(canChangeRole(owner, { id: "u", role: "user" })).toBe(true);
    expect(canChangeRole(admin, { id: "u", role: "user" })).toBe(false);
    expect(canChangeRole(owner, owner)).toBe(false);
  });
});

describe("user management", () => {
  it("lists every account with what the viewer may change, for admins only", async () => {
    const env = await setup();
    expect(await listUsersForAdminArea(env.db, env.actor("user"))).toBeNull();
    const items = await listUsersForAdminArea(env.db, env.actor("admin"));
    expect(items?.find((item) => item.id === "owner")).toMatchObject({ role: "owner", canManage: false, canChangeRole: false });
    expect(items?.find((item) => item.id === "admin")).toMatchObject({ isSelf: true, canManage: false });
    expect(items?.find((item) => item.id === "user")).toMatchObject({ active: true, emailVerified: false, canManage: true, canChangeRole: false });
    env.cleanup();
  });

  it("deactivates an account and activates it again; its session stays so the app can tell it why", async () => {
    const env = await setup();
    expect(await changeUser(env.db, env.actor("admin"), "user", { active: false })).toEqual({ ok: true, change: { active: false } });
    expect((await findUserById(env.db, "user"))?.disabledAt).not.toBeNull();
    expect((await env.db.select().from(session)).map((row) => row.userId)).toEqual(["user"]);
    await changeUser(env.db, env.actor("admin"), "user", { active: true });
    expect((await findUserById(env.db, "user"))?.disabledAt).toBeNull();
    env.cleanup();
  });

  it("confirms an email address by hand", async () => {
    const env = await setup();
    expect(await changeUser(env.db, env.actor("admin"), "user", { emailVerified: true })).toEqual({ ok: true, change: { emailVerified: true } });
    expect((await findUserById(env.db, "user"))?.emailVerified).toBe(true);
    env.cleanup();
  });

  it("lets only the owner change roles", async () => {
    const env = await setup();
    expect(await changeUser(env.db, env.actor("admin"), "user", { role: "admin" })).toEqual({ ok: false, error: "forbidden" });
    expect(await changeUser(env.db, env.actor("owner"), "user", { role: "admin" })).toEqual({ ok: true, change: { role: "admin" } });
    expect((await findUserById(env.db, "user"))?.role).toBe("admin");
    env.cleanup();
  });

  it("never touches the owner or the acting admin's own account", async () => {
    const env = await setup();
    for (const change of [{ active: false }, { emailVerified: true }, { role: "user" as const }]) {
      expect(await changeUser(env.db, env.actor("admin"), "owner", change)).toEqual({ ok: false, error: "forbidden" });
      expect(await changeUser(env.db, env.actor("owner"), "owner", change)).toEqual({ ok: false, error: "forbidden" });
    }
    expect(await changeUser(env.db, env.actor("admin"), "admin", { active: false })).toEqual({ ok: false, error: "forbidden" });
    expect((await findUserById(env.db, "owner"))).toMatchObject({ role: "owner", disabledAt: null });
    expect(await changeUser(env.db, env.actor("user"), "other", { active: false })).toEqual({ ok: false, error: "forbidden" });
    expect(await changeUser(env.db, env.actor("admin"), "nobody", { active: false })).toEqual({ ok: false, error: "not-found" });
    env.cleanup();
  });
});
