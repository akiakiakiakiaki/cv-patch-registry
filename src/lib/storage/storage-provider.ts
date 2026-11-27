export type UploadExtension = "svg" | "png" | "jpg" | "mp3" | "m4a";

/**
 * Stores uploaded bytes and returns a provider-neutral key. The database keeps only the key.
 * Providers can change without changing the persisted asset references.
 */
export interface StorageProvider {
  put(bytes: Uint8Array, extension: UploadExtension): Promise<string>;
  /** The stored bytes; rejects for unknown or invalid keys. */
  read(storageKey: string): Promise<Uint8Array>;
  remove(storageKey: string): Promise<void>;
  publicUrl(storageKey: string): string;
  /** Stores bytes under a given key, replacing a file already there (restoring a backup). */
  putAt(storageKey: string, bytes: Uint8Array): Promise<void>;
  /** Where the browser uploads a backup's file itself, so large files do not pass through the app's functions. */
  uploadTarget(storageKey: string): Promise<UploadTarget>;
}

/** A place the browser sends one file to with a single request. */
export interface UploadTarget {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}
