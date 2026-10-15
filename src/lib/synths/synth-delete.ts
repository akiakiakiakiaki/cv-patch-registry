import type { Database } from "@/lib/db/client";
import { canEditSynth, type Actor } from "@/lib/domain/policy";
import { findActiveSynthBySlug, markSynthDeleted } from "@/lib/repositories/synths-repository";

/**
 * Flags an owned synth as deleted. Nothing is removed yet: patches, revisions and panel images stay,
 * and the synth disappears from every list and view. A cleanup feature will remove it for good later.
 */
export async function deleteSynth(db: Database, actor: Actor, slug: string): Promise<{ ok: true } | { ok: false; error: "not-found" }> {
  const synth = await findActiveSynthBySlug(db, slug);
  if (!synth || !canEditSynth(actor, synth)) return { ok: false, error: "not-found" };
  if (!(await markSynthDeleted(db, synth.id, actor.id))) return { ok: false, error: "not-found" };
  return { ok: true };
}
