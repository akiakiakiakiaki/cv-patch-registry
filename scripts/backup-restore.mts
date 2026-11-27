/**
 * Restores a backup file into the configured database and storage, without the app running. Without --apply it only
 * shows what the backup holds and where it would go. Replaces ALL data; everyone signs in again afterwards.
 * Same file format as Admin → Import/Export.
 *
 *   npm run backup:restore -- <backup.zip> [--apply]
 * Another environment: node --env-file=<env file> node_modules/.bin/tsx --tsconfig tsconfig.json scripts/backup-restore.mts <backup.zip> [--apply]
 */
import { readFileSync } from "node:fs";
import { unpackBackup } from "@/lib/backup/backup-format";
import { restoreBackupData } from "@/lib/backup/backup-service";
import { closeDatabase, getDatabase } from "@/lib/db/client";
import { getStorage } from "@/lib/storage";

const file = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const apply = process.argv.includes("--apply");
if (!file) {
  console.error("Usage: npm run backup:restore -- <backup.zip> [--apply]");
  process.exit(2);
}

const backup = unpackBackup(new Uint8Array(readFileSync(file)));
const database = process.env.PATCH_DB_PROVIDER === "postgres" ? new URL(process.env.DATABASE_URL ?? "postgres://unset").host : `PGlite ${process.env.PATCH_DB_DIR ?? ".data/pglite"}`;
console.log(`Backup of ${backup.manifest.createdAt}, database version ${backup.manifest.migrations}`);
console.log(`Rows: ${Object.entries(backup.manifest.rows).map(([table, count]) => `${table} ${count}`).join(", ")}; files: ${backup.files.size}`);
console.log(`Target: database ${database}, storage ${process.env.STORAGE_PROVIDER ?? "local"}`);
if (!apply) {
  console.log("Nothing changed. Run again with --apply to replace ALL data of this target with the backup.");
  process.exit(0);
}

const handle = getDatabase();
try {
  const storage = getStorage();
  for (const [key, bytes] of backup.files) await storage.putAt(key, bytes);
  const result = await restoreBackupData(handle.db, backup);
  if (!result.ok) {
    console.error(`This backup is from a newer app (database version ${result.backupMigrations}, this app ${result.appMigrations}). Nothing changed in the database.`);
    process.exitCode = 1;
  } else {
    console.log("Restored. Everyone signs in again.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase(handle);
}
