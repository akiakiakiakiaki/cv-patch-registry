import { PROTON_CLONE_SLUG, migrateLegacyLibrary } from "@/lib/adapters/proton-legacy-migration-adapter";
import type { PatchLibrary } from "@/lib/domain/types";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import { LocalPatchRepository } from "@/lib/storage/local-patch-repository";

/**
 * The browser library for an instrument. The first time the Proton clone is opened without a library of its own,
 * the legacy Proton library of this browser is migrated and saved for it; the legacy library stays untouched.
 */
export function loadLocalLibrary(repository: LocalPatchRepository, instrumentId: string, defaultPatchName: string): PatchLibrary {
  if (instrumentId === PROTON_CLONE_SLUG && !repository.hasStoredLibrary()) {
    const legacy = new LocalPatchRepository(behringerProton);
    if (legacy.hasStoredLibrary()) {
      const migrated = migrateLegacyLibrary(legacy.load(defaultPatchName));
      repository.saveCurrent(migrated);
      return migrated;
    }
  }
  return repository.load(defaultPatchName);
}
