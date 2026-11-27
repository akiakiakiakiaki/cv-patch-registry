/**
 * Saves a complete backup (data and files) to this computer, without the app running: for when the admin area is
 * not reachable. Reads only; the database is not migrated. Same file format as Admin → Import/Export.
 *
 *   npm run backup:export -- [--out backups]
 * Another environment: node --env-file=<env file> node_modules/.bin/tsx --tsconfig tsconfig.json scripts/backup-export.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { backupFileName, packBackup } from "@/lib/backup/backup-format";
import { exportBackupData } from "@/lib/backup/backup-service";
import { closeDatabase, getDatabase } from "@/lib/db/client";
import { getStorage } from "@/lib/storage";

const outIndex = process.argv.indexOf("--out");
const outDir = outIndex >= 0 ? process.argv[outIndex + 1]! : "backups";

const handle = getDatabase();
try {
  const data = await exportBackupData(handle.db);
  const storage = getStorage();
  const files = new Map<string, Uint8Array>();
  const missingFiles: string[] = [];
  // A file storage does not have (lost before) is listed instead of failing the backup, like in the admin area.
  for (const key of data.manifest.files) {
    try {
      files.set(key, await storage.read(key));
    } catch {
      missingFiles.push(key);
    }
  }
  const manifest = { ...data.manifest, files: [...files.keys()], ...(missingFiles.length ? { missingFiles } : {}) };
  mkdirSync(outDir, { recursive: true });
  const target = path.join(outDir, backupFileName(manifest.createdAt));
  writeFileSync(target, packBackup({ manifest, tables: data.tables, files }));
  console.log(`Backup written: ${target}`);
  if (missingFiles.length) console.warn(`Missing in storage, not in the backup: ${missingFiles.join(", ")}`);
  console.log(`Rows: ${Object.entries(data.manifest.rows).map(([table, count]) => `${table} ${count}`).join(", ")}; files: ${files.size}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDatabase(handle);
}
