import type { Database } from "@/lib/db/client";
import { isAdmin, type Actor } from "@/lib/domain/policy";
import {
  countRemovableRevisions,
  findRevision,
  findSynthBySlug,
  listSynthsForAdmin,
  markSynthDeleted,
  purgeDeletedSynth,
  removeUnusedRevisions,
  restoreSynth,
  setSynthApproval,
} from "@/lib/repositories/synths-repository";
import type { StorageProvider } from "@/lib/storage/storage-provider";

/** One synth in the admin's synth management list. */
export interface SynthAdminItem {
  slug: string;
  displayName: string;
  manufacturer: string | null;
  /** Null for built-in synths. */
  owner: { name: string; email: string } | null;
  approved: boolean;
  /** Soft-deleted: hidden everywhere, restorable, or removable for good. */
  deleted: boolean;
  /** ISO date. */
  createdAt: string;
  /** Number of the current revision; numbers are never reused, so it is not the count. */
  revision: number | null;
  /** How many revisions are stored. */
  storedRevisions: number;
  /** Old revisions "reduce revisions" would remove (see removableRevisions in the repository). */
  removableRevisions: number;
  /** Patches on any revision of the synth, and how many users they belong to. */
  patchCount: number;
  patchOwnerCount: number;
}

/** Every synth (deleted ones included), newest first, for admins only (null otherwise). */
export async function listSynthsForAdminArea(db: Database, actor: Actor | null): Promise<SynthAdminItem[] | null> {
  if (!isAdmin(actor)) return null;
  const rows = await listSynthsForAdmin(db);
  return Promise.all(
    rows.map(async (row) => ({
      slug: row.slug,
      displayName: row.displayName,
      manufacturer: row.manufacturer,
      owner: row.ownerId && row.ownerEmail ? { name: row.ownerName ?? "", email: row.ownerEmail } : null,
      approved: row.approvedAt !== null,
      deleted: row.deletedAt !== null,
      createdAt: row.createdAt.toISOString(),
      revision: row.currentRevisionId ? ((await findRevision(db, row.currentRevisionId))?.number ?? null) : null,
      storedRevisions: row.storedRevisions,
      removableRevisions: await countRemovableRevisions(db, row.id),
      patchCount: row.patchCount,
      patchOwnerCount: row.patchOwnerCount,
    })),
  );
}

export type AdminFailure = { ok: false; error: "forbidden" | "not-found" };

/** A user synth an admin may manage; built-in synths are not managed here. */
async function managedSynth(db: Database, actor: Actor | null, slug: string) {
  if (!isAdmin(actor)) return { ok: false, error: "forbidden" } as const;
  const synth = await findSynthBySlug(db, slug);
  if (!synth || synth.ownerId === null) return { ok: false, error: "not-found" } as const;
  return { ok: true, synth, ownerId: synth.ownerId } as const;
}

/** Approves a synth or takes the approval back; admins only. Works on deleted synths too (see setSynthApproval). */
export async function setApproval(
  db: Database,
  actor: Actor | null,
  slug: string,
  approved: boolean,
): Promise<{ ok: true; approved: boolean } | AdminFailure> {
  const found = await managedSynth(db, actor, slug);
  if (!found.ok) return found;
  if (!(await setSynthApproval(db, found.synth.id, approved))) return { ok: false, error: "not-found" };
  return { ok: true, approved };
}

/** Deletes a synth (soft: hidden everywhere, restorable) or restores it; admins only. */
export async function setDeleted(
  db: Database,
  actor: Actor | null,
  slug: string,
  deleted: boolean,
): Promise<{ ok: true; deleted: boolean } | AdminFailure> {
  const found = await managedSynth(db, actor, slug);
  if (!found.ok) return found;
  const changed = deleted ? await markSynthDeleted(db, found.synth.id, found.ownerId) : await restoreSynth(db, found.synth.id);
  // Already in the requested state counts as done.
  if (!changed && Boolean(found.synth.deletedAt) !== deleted) return { ok: false, error: "not-found" };
  return { ok: true, deleted };
}

/**
 * Removes a deleted synth for good: its revisions, every user's patches on it, and its panel and sample files.
 * Only for synths already deleted (two steps, so nothing disappears with one click). Files are removed after
 * the database commit; a file that cannot be removed only leaves an orphan behind.
 */
export async function purgeSynth(
  deps: { db: Database; storage: StorageProvider },
  actor: Actor | null,
  slug: string,
): Promise<{ ok: true } | AdminFailure | { ok: false; error: "not-deleted" }> {
  const found = await managedSynth(deps.db, actor, slug);
  if (!found.ok) return found;
  if (!found.synth.deletedAt) return { ok: false, error: "not-deleted" };
  const purged = await purgeDeletedSynth(deps.db, found.synth.id);
  if (!purged) return { ok: false, error: "not-found" };
  await Promise.all(purged.storageKeys.map((key) => deps.storage.remove(key).catch(() => undefined)));
  return { ok: true };
}

/**
 * Removes old revisions nothing needs anymore: keeps the newest ones, the current one and every revision a patch
 * uses (see removableRevisions), and deletes panel images only the removed ones showed. Admins only.
 */
export async function reduceRevisions(
  deps: { db: Database; storage: StorageProvider },
  actor: Actor | null,
  slug: string,
): Promise<{ ok: true; removed: number } | AdminFailure> {
  const found = await managedSynth(deps.db, actor, slug);
  if (!found.ok) return found;
  const result = await removeUnusedRevisions(deps.db, found.synth.id);
  await Promise.all(result.storageKeys.map((key) => deps.storage.remove(key).catch(() => undefined)));
  return { ok: true, removed: result.removed };
}

