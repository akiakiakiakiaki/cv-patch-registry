// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; role: string } | null }));
const storageRoot = vi.hoisted(() => ({ dir: "" }));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => session.user }));
vi.mock("@/lib/storage", async () => {
  const { LocalFsStorage } = await import("@/lib/storage/local-fs-storage");
  const getStorage = () => new LocalFsStorage(storageRoot.dir, storageRoot.dir);
  return { getStorage, storagePublicUrl: (key: string) => `/assets/uploads/${key}` };
});

const admin = { id: "backup-admin", role: "admin" };
const member = { id: "backup-member", role: "user" };
const KEY = "0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f.png";

beforeAll(async () => {
  process.env.PATCH_DB_DIR = "memory://";
  storageRoot.dir = mkdtempSync(path.join(tmpdir(), "backup-routes-"));
  const { serverDatabase } = await import("@/lib/db/server");
  const { getDatabase } = await import("@/lib/db/client");
  const { user } = await import("@/lib/db/schema");
  await serverDatabase();
  await getDatabase().db.insert(user).values([admin, member].map((account) => ({ id: account.id, name: account.id, email: `${account.id}@example.test`, emailVerified: true, role: account.role as "user" | "admin" })));
});

const exportRoute = () => import("@/app/api/admin/backup/route");
const restoreRoute = () => import("@/app/api/admin/backup/restore/route");
const targetsRoute = () => import("@/app/api/admin/backup/upload-targets/route");
const fileRoute = () => import("@/app/api/admin/backup/files/[key]/route");
const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("backup routes", () => {
  it("are for admins only", async () => {
    for (const [user, status] of [[null, 401], [member, 403]] as const) {
      session.user = user;
      expect((await (await exportRoute()).GET()).status).toBe(status);
      expect((await (await restoreRoute()).POST(post("http://localhost/x", {}))).status).toBe(status);
      expect((await (await targetsRoute()).POST(post("http://localhost/x", { keys: [KEY] }))).status).toBe(status);
      const put = new Request("http://localhost/x", { method: "PUT", body: new Uint8Array([1]) });
      expect((await (await fileRoute()).PUT(put, { params: Promise.resolve({ key: KEY }) })).status).toBe(status);
    }
  });

  it("export the data with every file's URL, and restore it", async () => {
    session.user = admin;
    const exported = (await (await (await exportRoute()).GET()).json()) as { manifest: { migrations: number }; tables: Record<string, unknown[]>; fileUrls: Record<string, string> };
    expect(exported.tables.user).toHaveLength(2);
    expect(exported.fileUrls).toEqual({});
    const restored = await (await restoreRoute()).POST(post("http://localhost/x", { manifest: exported.manifest, tables: exported.tables }));
    expect(await restored.json()).toEqual({ ok: true });
  });

  it("refuse incomplete data, other sites and newer backups", async () => {
    session.user = admin;
    const exported = (await (await (await exportRoute()).GET()).json()) as { manifest: { migrations: number }; tables: Record<string, unknown[]> };
    expect((await (await restoreRoute()).POST(post("http://localhost/x", { manifest: exported.manifest, tables: { user: [] } }))).status).toBe(422);
    expect((await (await restoreRoute()).POST(post("http://localhost/x", exported, { origin: "https://evil.example" }))).status).toBe(403);
    const newer = await (await restoreRoute()).POST(post("http://localhost/x", { ...exported, manifest: { migrations: exported.manifest.migrations + 1 } }));
    expect(newer.status).toBe(409);
    expect(await newer.json()).toMatchObject({ error: "newer-backup" });
  });

  it("hand out upload targets and store local files under their key", async () => {
    session.user = admin;
    const targets = await (await targetsRoute()).POST(post("http://localhost/x", { keys: [KEY] }));
    expect(await targets.json()).toEqual({ targets: { [KEY]: { url: `/api/admin/backup/files/${KEY}`, method: "PUT", headers: {} } } });
    expect((await (await targetsRoute()).POST(post("http://localhost/x", { keys: ["../escape.png"] }))).status).toBe(422);

    const put = new Request(`http://localhost/api/admin/backup/files/${KEY}`, { method: "PUT", body: new Uint8Array([7, 8]) });
    expect((await (await fileRoute()).PUT(put, { params: Promise.resolve({ key: KEY }) })).status).toBe(204);
    expect(readFileSync(path.join(storageRoot.dir, KEY))).toEqual(Buffer.from([7, 8]));
    const bad = new Request("http://localhost/x", { method: "PUT", body: new Uint8Array([1]) });
    expect((await (await fileRoute()).PUT(bad, { params: Promise.resolve({ key: "nope.exe" }) })).status).toBe(422);
    expect(existsSync(path.join(storageRoot.dir, "nope.exe"))).toBe(false);
  });
});
