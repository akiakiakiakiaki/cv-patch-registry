import { LocalFsStorage } from "@/lib/storage/local-fs-storage";
import type { StorageProvider } from "@/lib/storage/storage-provider";

let instance: StorageProvider | undefined;

/** The active storage provider. Only the local filesystem is implemented for now. */
export function getStorage(): StorageProvider {
  instance ??= new LocalFsStorage();
  return instance;
}
