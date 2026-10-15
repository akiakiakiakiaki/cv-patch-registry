export type UploadExtension = "svg" | "png" | "jpg" | "mp3";

/**
 * Stores uploaded bytes and returns a relative storage key. The database keeps only the key.
 * Other providers (S3-compatible, Supabase Storage) implement this interface later without migrating data.
 */
export interface StorageProvider {
  put(bytes: Uint8Array, extension: UploadExtension): Promise<string>;
  remove(storageKey: string): Promise<void>;
  publicUrl(storageKey: string): string;
}
