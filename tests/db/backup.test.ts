import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { BACKUP_TABLES, packBackup, unpackBackup } from "@/lib/backup/backup-format";
import { exportBackupData, restoreBackupData } from "@/lib/backup/backup-service";
import { createDatabase, ensureDatabase } from "@/lib/db/client";
import { session, synths, user } from "@/lib/db/schema";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import { createPatch, getPatchView } from "@/lib/patches/patch-service";

async function database() {
  const handle = createDatabase("memory://");
  await ensureDatabase(handle);
  return handle;
}

/** A database with an account, a session and a tagged public patch. */
async function filled() {
  const handle = await database();
  const db = handle.db;
  await db.insert(user).values({ id: "ada", name: "Ada", email: "ada@example.test", emailVerified: true, role: "owner" });
  await db.insert(session).values({ id: "s1", token: "t1", userId: "ada", expiresAt: new Date(Date.now() + 60_000) });
  const created = await createPatch(db, { id: "ada" }, { synthSlug: behringerProton.id, name: "Bass", visibility: "public", tags: ["Acid"] });
  if (!created.ok) throw new Error("patch failed");
  return { handle, db, patchId: created.id };
}

/** The migrations folder as it was with only the first `count` migrations. */
function olderMigrations(count: number): string {
  const folder = mkdtempSync(path.join(tmpdir(), "migrations-"));
  cpSync("drizzle", folder, { recursive: true });
  const journalPath = path.join(folder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: unknown[] };
  journal.entries = journal.entries.slice(0, count);
  writeFileSync(journalPath, JSON.stringify(journal));
  return folder;
}

describe("backup export", () => {
  it("contains every backup table as stored, the migration count and the file list, but no sessions", async () => {
    const { handle, db } = await filled();
    const { manifest, tables } = await exportBackupData(db);
    expect(Object.keys(tables).sort()).toEqual([...BACKUP_TABLES].sort());
    expect(tables.user).toEqual([expect.objectContaining({ id: "ada", email: "ada@example.test", role: "owner", emailVerified: true })]);
    expect(tables.patches).toHaveLength(1);
    expect(manifest.rows.patches).toBe(1);
    expect(manifest.migrations).toBe(JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")).entries.length);
    expect(manifest.files).toEqual([]);
    expect(JSON.stringify(tables)).not.toContain("t1");
    await handle.client.close();
  });
});

describe("backup restore", () => {
  it("replaces the whole database with the backup, in a round trip through the backup file", async () => {
    const source = await filled();
    const exported = await exportBackupData(source.db);
    const file = packBackup({ ...exported, files: new Map() });

    const target = await database();
    await target.db.insert(user).values({ id: "zed", name: "Zed", email: "zed@example.test", emailVerified: true });
    expect(await restoreBackupData(target.db, unpackBackup(file))).toEqual({ ok: true });

    expect((await target.db.select().from(user)).map((row) => row.id)).toEqual(["ada"]);
    expect(await target.db.select().from(session)).toEqual([]);
    expect(await getPatchView(target.db, null, source.patchId)).toMatchObject({ name: "Bass", tags: ["acid"] });
    expect(await exportBackupData(target.db)).toMatchObject({ tables: exported.tables });
    await source.handle.client.close();
    await target.client.close();
  });

  it("brings an older backup up to date, with the newer migrations' data updates", async () => {
    // A database from before synth approvals (6 migrations): its synths have no approval yet.
    const old = createDatabase("memory://");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(old.db, { migrationsFolder: olderMigrations(6) });
    await old.db.execute(sql`insert into synths (id, owner_id, slug, display_name) values ('s1', null, 'old-synth', 'Old')`);
    const backup = await exportBackupData(old.db);
    expect(backup.manifest.migrations).toBe(6);

    const target = await database();
    expect(await restoreBackupData(target.db, backup)).toEqual({ ok: true });
    const [restored] = await target.db.select().from(synths).where(eq(synths.slug, "old-synth"));
    // Migration 0006 ran over the restored rows: the existing synth counts as approved.
    expect(restored?.approvedAt).not.toBeNull();
    await old.client.close();
    await target.client.close();
  });

  it("refuses a backup from a newer app and leaves everything as it was", async () => {
    const { handle, db } = await filled();
    const backup = await exportBackupData(db);
    const result = await restoreBackupData(db, { ...backup, manifest: { ...backup.manifest, migrations: backup.manifest.migrations + 1 } });
    expect(result).toMatchObject({ ok: false, error: "newer-backup" });
    expect((await db.select().from(user)).map((row) => row.id)).toEqual(["ada"]);
    await handle.client.close();
  });

  it("changes nothing when the backup's data does not fit", async () => {
    const { handle, db } = await filled();
    const backup = await exportBackupData(db);
    // A patch on a revision that is not in the backup breaks a foreign key.
    const broken = { ...backup, tables: { ...backup.tables, synth_revisions: [] } };
    await expect(restoreBackupData(db, broken)).rejects.toThrow();
    expect((await db.select().from(user)).map((row) => row.id)).toEqual(["ada"]);
    expect(await db.select().from(session)).toHaveLength(1);
    await handle.client.close();
  });
});

describe("backup file", () => {
  it("keeps files and refuses anything that is not a complete backup", async () => {
    const { handle, db } = await filled();
    const exported = await exportBackupData(db);
    const bytes = new Uint8Array([1, 2, 3]);
    const file = packBackup({ manifest: { ...exported.manifest, files: ["k.png"] }, tables: exported.tables, files: new Map([["k.png", bytes]]) });
    expect(unpackBackup(file).files.get("k.png")).toEqual(bytes);
    expect(() => unpackBackup(new Uint8Array([1, 2, 3]))).toThrow("not-a-zip");
    const withoutFile = packBackup({ manifest: { ...exported.manifest, files: ["k.png"] }, tables: exported.tables, files: new Map() });
    expect(() => unpackBackup(withoutFile)).toThrow("missing-file");
    await handle.client.close();
  });
});
