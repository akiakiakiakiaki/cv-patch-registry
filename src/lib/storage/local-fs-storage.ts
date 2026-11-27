import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIRECTORY, isValidUploadKey, uploadPublicUrl } from "@/lib/storage/upload-files";
import type { StorageProvider, UploadExtension, UploadTarget } from "@/lib/storage/storage-provider";

const DEFAULT_TEMP_DIRECTORY = path.join(/* turbopackIgnore: true */ process.cwd(), ".data", "tmp");

/**
 * Writes into a temporary directory first and renames into the public upload directory,
 * so a half-written file is never served. File names are generated here, never taken from the client.
 */
export class LocalFsStorage implements StorageProvider {
  constructor(
    private readonly root = UPLOAD_DIRECTORY,
    private readonly temporaryRoot = DEFAULT_TEMP_DIRECTORY,
  ) {}

  async put(bytes: Uint8Array, extension: UploadExtension): Promise<string> {
    const storageKey = `${randomUUID()}.${extension}`;
    await mkdir(this.temporaryRoot, { recursive: true });
    await mkdir(this.root, { recursive: true });
    // Every path is marked for the bundler: otherwise it traces the whole project (sources, tests, local data)
    // into every server function, although this storage is never used on Vercel.
    await writeFile(path.join(/* turbopackIgnore: true */ this.temporaryRoot, storageKey), bytes, { flag: "wx" });
    await rename(
      path.join(/* turbopackIgnore: true */ this.temporaryRoot, storageKey),
      path.join(/* turbopackIgnore: true */ this.root, storageKey),
    );
    return storageKey;
  }

  async read(storageKey: string): Promise<Uint8Array> {
    if (!isValidUploadKey(storageKey)) throw new Error("Invalid storage key");
    return new Uint8Array(await readFile(path.join(/* turbopackIgnore: true */ this.root, storageKey)));
  }

  async remove(storageKey: string): Promise<void> {
    if (!isValidUploadKey(storageKey)) return;
    await rm(path.join(/* turbopackIgnore: true */ this.root, storageKey), { force: true });
  }

  async putAt(storageKey: string, bytes: Uint8Array): Promise<void> {
    if (!isValidUploadKey(storageKey)) throw new Error("Invalid storage key");
    await mkdir(this.root, { recursive: true });
    await writeFile(path.join(/* turbopackIgnore: true */ this.root, storageKey), bytes);
  }

  /** Local uploads go through the app (no size limit locally); see the admin backup file route. */
  async uploadTarget(storageKey: string): Promise<UploadTarget> {
    if (!isValidUploadKey(storageKey)) throw new Error("Invalid storage key");
    return { url: `/api/admin/backup/files/${encodeURIComponent(storageKey)}`, method: "PUT", headers: {} };
  }

  publicUrl(storageKey: string): string {
    if (!isValidUploadKey(storageKey)) throw new Error("Invalid storage key");
    return uploadPublicUrl(storageKey);
  }
}
