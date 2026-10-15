import type { PatchLibrary, PatchRecord } from "@/lib/domain/types";

export interface LibraryDiff {
  created: PatchRecord[];
  deleted: string[];
  changed: string[];
}

/** What changed between two library snapshots. Used to translate local edits into API calls. */
export function diffPatchLibraries(previous: PatchLibrary | null, next: PatchLibrary): LibraryDiff {
  const before = new Map((previous?.patches ?? []).map((patch) => [patch.id, patch]));
  const after = new Map(next.patches.map((patch) => [patch.id, patch]));
  const created = next.patches.filter((patch) => !before.has(patch.id));
  const deleted = [...before.keys()].filter((id) => !after.has(id));
  const changed = next.patches
    .filter((patch) => {
      const old = before.get(patch.id);
      return old !== undefined && (old.name !== patch.name || JSON.stringify(old.data) !== JSON.stringify(patch.data));
    })
    .map((patch) => patch.id);
  return { created, deleted, changed };
}
