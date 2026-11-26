import { LEGACY_PROTON_SLUG, PROTON_CLONE_SLUG, migrateLegacyLibrary } from "@/lib/adapters/proton-legacy-migration-adapter";
import { hasGuestContent } from "@/lib/domain/patch-service";
import type { PatchLibrary, PatchRecord } from "@/lib/domain/types";
import type { InstrumentLayout } from "@/lib/instrument/layout";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import { instrumentFromSynth } from "@/lib/instruments/from-synth";
import { LocalPatchRepository } from "@/lib/storage/local-patch-repository";

/**
 * Guest patches move into a new account once: registering marks this browser, and the first sign-in with that
 * account copies every synth library with patches of its own into the account and then removes the browser copy.
 * Legacy Proton patches go into the editable Proton (migrated), like everywhere else.
 */

const PENDING_KEY = "patch-sheet:guest-transfer-pending";
/** The import endpoint accepts at most this many patches per request. */
const IMPORT_BATCH = 100;

export function markGuestTransferPending(email: string): void {
  try {
    window.localStorage.setItem(PENDING_KEY, email.trim().toLowerCase());
  } catch {
    // Without storage the guest patches simply stay in the browser.
  }
}

export function guestTransferPendingFor(email: string | null | undefined): boolean {
  if (!email) return false;
  try {
    return window.localStorage.getItem(PENDING_KEY) === email.trim().toLowerCase();
  } catch {
    return false;
  }
}

export function clearGuestTransferPending(): void {
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing to clear.
  }
}

type ImportedPatch = Pick<PatchRecord, "id" | "name" | "data">;

export interface GuestTransferDeps {
  /** The synth as the app shows it, or null when it does not exist (anymore). */
  loadSynth: (slug: string) => Promise<{ slug: string; displayName: string; panelUrl: string; layout: InstrumentLayout } | null>;
  /** Copies patches into the signed-in account; resolves true on success. */
  importPatches: (slug: string, patches: readonly ImportedPatch[]) => Promise<boolean>;
}

export interface GuestTransferResult {
  transferred: Array<{ slug: string; count: number }>;
  failed: string[];
}

export async function transferGuestPatches(deps: GuestTransferDeps): Promise<GuestTransferResult> {
  const result: GuestTransferResult = { transferred: [], failed: [] };

  async function transfer(slug: string, library: PatchLibrary, repositories: readonly LocalPatchRepository[]) {
    if (!hasGuestContent(library)) return;
    const patches = library.patches.map(({ id, name, data }) => ({ id, name: name.trim() || slug, data }));
    for (let start = 0; start < patches.length; start += IMPORT_BATCH) {
      if (!(await deps.importPatches(slug, patches.slice(start, start + IMPORT_BATCH)))) {
        result.failed.push(slug);
        return;
      }
    }
    for (const repository of repositories) repository.clear();
    result.transferred.push({ slug, count: patches.length });
  }

  const ids = LocalPatchRepository.storedInstrumentIds();
  if (ids.includes(LEGACY_PROTON_SLUG) || ids.includes(PROTON_CLONE_SLUG)) {
    const legacyRepository = new LocalPatchRepository(behringerProton);
    const clone = await deps.loadSynth(PROTON_CLONE_SLUG);
    if (clone) {
      const cloneRepository = new LocalPatchRepository(instrumentFromSynth(clone));
      const own = cloneRepository.hasStoredLibrary() ? cloneRepository.load("").patches : [];
      const legacy = legacyRepository.hasStoredLibrary() ? migrateLegacyLibrary(legacyRepository.load("")).patches : [];
      const patches = [...own, ...legacy.filter((patch) => !own.some((item) => item.id === patch.id))];
      await transfer(PROTON_CLONE_SLUG, { activeId: patches[0]?.id ?? "", patches }, [cloneRepository, legacyRepository]);
    } else if (legacyRepository.hasStoredLibrary()) {
      await transfer(LEGACY_PROTON_SLUG, legacyRepository.load(""), [legacyRepository]);
    }
  }
  for (const id of ids) {
    if (id === LEGACY_PROTON_SLUG || id === PROTON_CLONE_SLUG) continue;
    const synth = await deps.loadSynth(id);
    if (!synth) continue;
    const repository = new LocalPatchRepository(instrumentFromSynth(synth));
    await transfer(id, repository.load(""), [repository]);
  }
  return result;
}
