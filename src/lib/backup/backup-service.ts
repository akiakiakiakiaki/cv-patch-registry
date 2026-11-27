import path from "node:path";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BACKUP_TABLES,
  type BackupManifest,
  type BackupRows,
  type BackupTables,
} from "@/lib/backup/backup-format";
import type { Database } from "@/lib/db/client";

const MIGRATIONS_FOLDER = path.join(/* turbopackIgnore: true */ process.cwd(), "drizzle");

/** Every table the migrations create; a restore drops and rebuilds all of them, also those not in the backup. */
const APP_TABLES = [...BACKUP_TABLES, "session", "verification"] as const;

type Executor = Pick<Database, "execute">;

async function rowsOf<T>(db: Executor, query: ReturnType<typeof sql>): Promise<T[]> {
  return ((await db.execute(query)) as unknown as { rows: T[] }).rows;
}

/**
 * The database part of a backup: every backup table as the database stores it (column names and values), and how
 * many migrations it has. Files are listed by their storage keys; their bytes are fetched separately.
 */
export async function exportBackupData(db: Database): Promise<{ manifest: BackupManifest; tables: BackupTables }> {
  const tables = {} as BackupTables;
  for (const table of BACKUP_TABLES) {
    const [result] = await rowsOf<{ rows: BackupRows }>(
      db,
      sql`select coalesce(json_agg(t), '[]'::json) as rows from ${sql.identifier(table)} t`,
    );
    tables[table] = result?.rows ?? [];
  }
  const [applied] = await rowsOf<{ count: number }>(db, sql`select count(*)::int as count from drizzle.__drizzle_migrations`);
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    migrations: applied?.count ?? 0,
    rows: Object.fromEntries(BACKUP_TABLES.map((table) => [table, tables[table].length])) as BackupManifest["rows"],
    files: tables.assets.map((row) => String(row.storage_key)),
  };
  return { manifest, tables };
}

export type RestoreFailure = { ok: false; error: "newer-backup"; backupMigrations: number; appMigrations: number };

/**
 * Replaces the whole database with a backup, in one transaction (nothing changes if anything fails):
 * 1. drop every app table and forget the applied migrations,
 * 2. rebuild the tables as they were when the backup was made (its migrations only),
 * 3. insert the backup's rows,
 * 4. apply the newer migrations on top, with their data updates, and record all migrations as applied.
 * A backup from a newer app (more migrations) is refused. Sessions are not restored: everyone signs in again.
 */
export async function restoreBackupData(
  db: Database,
  backup: { manifest: Pick<BackupManifest, "migrations">; tables: BackupTables },
  migrationsFolder = MIGRATIONS_FOLDER,
): Promise<{ ok: true } | RestoreFailure> {
  const migrations = readMigrationFiles({ migrationsFolder });
  const level = backup.manifest.migrations;
  if (level > migrations.length) return { ok: false, error: "newer-backup", backupMigrations: level, appMigrations: migrations.length };

  await db.transaction(async (tx) => {
    for (const table of APP_TABLES) await tx.execute(sql`drop table if exists ${sql.identifier(table)} cascade`);
    await tx.execute(sql`create schema if not exists drizzle`);
    await tx.execute(sql`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`);
    await tx.execute(sql`delete from drizzle.__drizzle_migrations`);

    const apply = async (from: number, to: number) => {
      for (const migration of migrations.slice(from, to)) {
        for (const statement of migration.sql) if (statement.trim()) await tx.execute(sql.raw(statement));
      }
    };
    await apply(0, level);
    for (const table of BACKUP_TABLES) {
      const rows = backup.tables[table];
      if (!rows.length) continue;
      await tx.execute(
        sql`insert into ${sql.identifier(table)} select * from json_populate_recordset(null::${sql.identifier(table)}, ${JSON.stringify(rows)}::json)`,
      );
    }
    await apply(level, migrations.length);
    for (const migration of migrations) {
      await tx.execute(sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${migration.hash}, ${migration.folderMillis})`);
    }
  });
  return { ok: true };
}
