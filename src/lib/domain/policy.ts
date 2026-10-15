/**
 * Pure authorization rules. Every mutation also scopes its database query by owner (see repositories),
 * so a forgotten check here is still caught by the query. Foreign or missing resources answer 404.
 */
export interface Actor {
  id: string;
}

export type Visibility = "private" | "public";

export function canEditSynth(actor: Actor | null, synth: { ownerId: string | null }): boolean {
  return actor !== null && synth.ownerId !== null && synth.ownerId === actor.id;
}

export function canUploadAsset(actor: Actor | null): boolean {
  return actor !== null;
}

/** Public patches are readable by everyone. Private patches only by their owner. */
export function canViewPatch(actor: Actor | null, patch: { ownerId: string; visibility: Visibility }): boolean {
  if (patch.visibility === "public") return true;
  return actor !== null && patch.ownerId === actor.id;
}

/** Public patches stay read-only for everyone except the owner. Cloning for others comes later. */
export function canEditPatch(actor: Actor | null, patch: { ownerId: string }): boolean {
  return actor !== null && patch.ownerId === actor.id;
}
