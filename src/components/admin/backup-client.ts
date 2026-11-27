import { packBackup, unpackBackup, type Backup } from "@/lib/backup/backup-format";
import { api } from "@/lib/api/client";

/** How far a backup or restore is, for the progress text. */
export type BackupProgress =
  | { step: "data" }
  | { step: "files"; done: number; total: number }
  | { step: "pack" }
  | { step: "restore" };

/** Files per request for upload targets; the route accepts at most 200. */
const TARGET_BATCH = 100;

/**
 * Builds a backup file in the browser: the database part from the app, every file straight from storage (so large
 * files never pass through the app's functions), packed into one ZIP. A file storage does not have is skipped and
 * listed in the manifest (`missingFiles`) instead of failing the whole backup.
 */
export async function createBackupFile(
  onProgress: (progress: BackupProgress) => void,
): Promise<{ bytes: Uint8Array; createdAt: string; missingFiles: string[] }> {
  onProgress({ step: "data" });
  const data = await api.admin.backupData();
  if (!data.ok) throw new BackupError("export-failed");
  const files = new Map<string, Uint8Array>();
  const missingFiles: string[] = [];
  const keys = data.data.manifest.files;
  for (const [index, key] of keys.entries()) {
    onProgress({ step: "files", done: index, total: keys.length });
    const response = await fetch(data.data.fileUrls[key]!, { cache: "no-store" });
    if (response.ok) files.set(key, new Uint8Array(await response.arrayBuffer()));
    else if (response.status === 400 || response.status === 404) missingFiles.push(key);
    else throw new BackupError("file-failed", key);
  }
  onProgress({ step: "pack" });
  const manifest = { ...data.data.manifest, files: [...files.keys()], ...(missingFiles.length ? { missingFiles } : {}) };
  return { bytes: packBackup({ manifest, tables: data.data.tables, files }), createdAt: manifest.createdAt, missingFiles };
}

/** Reads a chosen backup file; throws BackupFormatError for anything else. */
export async function readBackupFile(file: Blob): Promise<Backup> {
  return unpackBackup(new Uint8Array(await file.arrayBuffer()));
}

/**
 * Restores a backup: uploads its files straight to storage first, then replaces the database. Throws a
 * BackupError when a step fails; a backup from a newer app ("newer-backup") changes nothing.
 */
export async function restoreBackup(backup: Backup, onProgress: (progress: BackupProgress) => void): Promise<void> {
  const keys = [...backup.files.keys()];
  let done = 0;
  for (let start = 0; start < keys.length; start += TARGET_BATCH) {
    const batch = keys.slice(start, start + TARGET_BATCH);
    const targets = await api.admin.backupUploadTargets(batch);
    if (!targets.ok) throw new BackupError("upload-failed");
    for (const key of batch) {
      onProgress({ step: "files", done, total: keys.length });
      const target = targets.data.targets[key]!;
      const bytes = backup.files.get(key)!;
      const response = await fetch(target.url, { method: target.method, headers: target.headers, body: new Blob([bytes as BlobPart]) });
      if (!response.ok) throw new BackupError("upload-failed", key);
      done += 1;
    }
  }
  onProgress({ step: "restore" });
  const restored = await api.admin.restoreBackup({ manifest: backup.manifest, tables: backup.tables });
  if (!restored.ok) throw new BackupError(restored.error === "newer-backup" ? "newer-backup" : "restore-failed");
}

export type BackupProblem = "export-failed" | "file-failed" | "upload-failed" | "newer-backup" | "restore-failed";

export class BackupError extends Error {
  constructor(
    readonly problem: BackupProblem,
    readonly detail?: string,
  ) {
    super(`Backup failed: ${problem}${detail ? ` (${detail})` : ""}`);
  }
}
