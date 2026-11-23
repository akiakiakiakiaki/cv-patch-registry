export type UploadExtension = "svg" | "png" | "jpg" | "mp3";

/**
 * Stores uploaded bytes and returns a provider-neutral key. The database keeps only the key.
 * Providers can change without changing the persisted asset references.
 */
export interface StorageProvider {
  put(bytes: Uint8Array, extension: UploadExtension): Promise<string>;
  remove(storageKey: string): Promise<void>;
  publicUrl(storageKey: string): string;
}
