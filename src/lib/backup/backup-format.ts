import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

/**
 * The backup file: a ZIP with `manifest.json`, one `data/<table>.json` per table (rows as the database stores them,
 * column names included) and every stored file under `files/<storage key>`. Made and read the same way by the admin
 * area (in the browser) and by `npm run backup:*` (locally), so either can restore what the other exported.
 */
export const BACKUP_FORMAT = "cv-patch-registry-backup";
export const BACKUP_FORMAT_VERSION = 1;

/**
 * Tables in the backup, in an order that inserts parents before children. Sessions and verification tokens are
 * left out: they are short-lived, and after a restore everyone signs in again.
 */
export const BACKUP_TABLES = ["user", "account", "tags", "assets", "synths", "synth_revisions", "patches", "patch_tags", "patch_samples"] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

export type BackupRows = Record<string, unknown>[];
export type BackupTables = Record<BackupTable, BackupRows>;

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  /** ISO date of the export. */
  createdAt: string;
  /** How many database migrations the exporting app had applied; restoring replays the rest. */
  migrations: number;
  rows: Record<BackupTable, number>;
  /** Storage keys of every file in the backup. */
  files: string[];
  /**
   * Files the database refers to but storage did not have when the backup was made (lost before). Their rows are
   * restored as they were; the files stay missing.
   */
  missingFiles?: string[];
}

export interface Backup {
  manifest: BackupManifest;
  tables: BackupTables;
  files: Map<string, Uint8Array>;
}

export function backupFileName(createdAt: string): string {
  return `cv-patch-registry-backup-${createdAt.replace(/[:.]/g, "-")}.zip`;
}

/**
 * fflate tells files from folders with `instanceof Uint8Array`. Bytes from another realm (a worker, a test
 * environment's encoder) fail that check and would become empty folders, so they are copied into this realm.
 */
function ownBytes(bytes: Uint8Array): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

export function packBackup(backup: Backup): Uint8Array {
  const entries: Zippable = { "manifest.json": ownBytes(strToU8(JSON.stringify(backup.manifest, null, 2))) };
  for (const table of BACKUP_TABLES) entries[`data/${table}.json`] = ownBytes(strToU8(JSON.stringify(backup.tables[table])));
  // Files are already compressed (images, audio): stored as they are.
  for (const [key, bytes] of backup.files) entries[`files/${key}`] = [ownBytes(bytes), { level: 0 }];
  return zipSync(entries, { level: 6 });
}

/** Reads a backup file; throws a BackupFormatError for anything that is not a complete backup of this app. */
export function unpackBackup(zip: Uint8Array): Backup {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip);
  } catch {
    throw new BackupFormatError("not-a-zip");
  }
  const manifestBytes = entries["manifest.json"];
  if (!manifestBytes) throw new BackupFormatError("no-manifest");
  const manifest = parseJson(manifestBytes) as Partial<BackupManifest>;
  if (manifest.format !== BACKUP_FORMAT || manifest.formatVersion !== BACKUP_FORMAT_VERSION) throw new BackupFormatError("unknown-format");
  if (typeof manifest.migrations !== "number" || !Array.isArray(manifest.files)) throw new BackupFormatError("unknown-format");

  const tables = {} as BackupTables;
  for (const table of BACKUP_TABLES) {
    const bytes = entries[`data/${table}.json`];
    const rows = bytes ? parseJson(bytes) : null;
    if (!Array.isArray(rows)) throw new BackupFormatError("missing-data");
    tables[table] = rows as BackupRows;
  }
  const files = new Map<string, Uint8Array>();
  for (const key of manifest.files) {
    const bytes = entries[`files/${key}`];
    if (!bytes) throw new BackupFormatError("missing-file");
    files.set(key, bytes);
  }
  return { manifest: manifest as BackupManifest, tables, files };
}

export type BackupFormatProblem = "not-a-zip" | "no-manifest" | "unknown-format" | "missing-data" | "missing-file";

export class BackupFormatError extends Error {
  constructor(readonly problem: BackupFormatProblem) {
    super(`Not a valid backup: ${problem}`);
  }
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    throw new BackupFormatError("unknown-format");
  }
}
