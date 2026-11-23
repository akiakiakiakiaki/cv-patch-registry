import { LocalFsStorage } from "@/lib/storage/local-fs-storage";
import { SupabaseStorage } from "@/lib/storage/supabase-storage";
import type { StorageProvider } from "@/lib/storage/storage-provider";

let instance: StorageProvider | undefined;

/** The active server-side upload provider. Local disk remains the local-development default. */
export function getStorage(): StorageProvider {
  if (instance) return instance;

  const configuredProvider = process.env.STORAGE_PROVIDER;
  if (process.env.VERCEL === "1" && !configuredProvider) {
    throw new Error("STORAGE_PROVIDER=supabase must be configured on Vercel");
  }
  const provider = configuredProvider ?? "local";
  if (provider === "local") {
    if (process.env.VERCEL === "1") {
      throw new Error("Local filesystem storage is not supported on Vercel; set STORAGE_PROVIDER=supabase");
    }
    instance = new LocalFsStorage();
  } else if (provider === "supabase") {
    instance = new SupabaseStorage();
  } else {
    throw new Error(`Unsupported STORAGE_PROVIDER: ${provider}`);
  }
  return instance;
}

/** Builds an asset URL through the configured provider while keeping storage keys provider-neutral. */
export function storagePublicUrl(storageKey: string): string {
  return getStorage().publicUrl(storageKey);
}
