import type { Database } from "@/lib/db/client";
import { isAdmin, type Actor } from "@/lib/domain/policy";
import { listPatchesForAdmin, tagsFor } from "@/lib/repositories/patches-repository";

/** One patch in the admin's overview. */
export interface PatchAdminItem {
  id: string;
  name: string;
  owner: { name: string; email: string };
  visibility: string;
  tagLabels: string[];
  hasSample: boolean;
  /** ISO dates. */
  createdAt: string;
  updatedAt: string;
  /** How often the patch has been saved. */
  revision: number;
  /** The synth revision the patch is stored with; older than the synth's current one when the patch is outdated. */
  synthRevision: number;
}

/** Patches of one synth. */
export interface PatchGroup {
  synth: { slug: string; displayName: string; deleted: boolean; currentRevision: number | null };
  patches: PatchAdminItem[];
}

/** Every patch, grouped by synth (by name), newest changes first in each group; admins only (null otherwise). */
export async function listPatchGroups(db: Database, actor: Actor | null): Promise<PatchGroup[] | null> {
  if (!isAdmin(actor)) return null;
  const rows = await listPatchesForAdmin(db);
  const tags = await tagsFor(db, rows.map((row) => row.patch.id));
  const groups = new Map<string, PatchGroup>();
  for (const row of rows) {
    const group = groups.get(row.synth.slug) ?? { synth: row.synth, patches: [] };
    group.patches.push({
      id: row.patch.id,
      name: row.patch.name,
      owner: { name: row.ownerName, email: row.ownerEmail },
      visibility: row.patch.visibility,
      tagLabels: (tags.get(row.patch.id) ?? []).map((tag) => tag.label),
      hasSample: row.hasSample,
      createdAt: row.patch.createdAt.toISOString(),
      updatedAt: row.patch.updatedAt.toISOString(),
      revision: row.patch.revision,
      synthRevision: row.synthRevision,
    });
    groups.set(row.synth.slug, group);
  }
  return [...groups.values()].sort((left, right) => left.synth.displayName.localeCompare(right.synth.displayName));
}
