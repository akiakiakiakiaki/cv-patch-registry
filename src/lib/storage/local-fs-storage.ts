import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIRECTORY, isValidUploadKey, uploadPublicUrl } from "@/lib/storage/upload-files";
import type { StorageProvider, UploadExtension } from "@/lib/storage/storage-provider";

const DEFAULT_TEMP_DIRECTORY = path.join(process.cwd(), ".data", "tmp");

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
    const temporaryPath = path.join(this.temporaryRoot, storageKey);
    await writeFile(temporaryPath, bytes, { flag: "wx" });
    await rename(temporaryPath, path.join(this.root, storageKey));
    return storageKey;
  }

  async remove(storageKey: string): Promise<void> {
    if (!isValidUploadKey(storageKey)) return;
    await rm(path.join(this.root, storageKey), { force: true });
  }

  publicUrl(storageKey: string): string {
    if (!isValidUploadKey(storageKey)) throw new Error("Invalid storage key");
    return uploadPublicUrl(storageKey);
  }
}
