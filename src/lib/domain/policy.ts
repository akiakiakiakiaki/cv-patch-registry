import { isAdminRole } from "@/lib/auth/roles";

/**
 * Pure authorization rules. Every mutation also scopes its database query by owner (see repositories),
 * so a forgotten check here is still caught by the query. Foreign or missing resources answer 404.
 */
export interface Actor {
  id: string;
  /** The signed-in user's role; "admin" may see and edit every synth. */
  role?: string | null;
}

export type Visibility = "private" | "public";

export function isAdmin(actor: Actor | null): boolean {
  return isAdminRole(actor?.role);
}

/** Its owner and admins edit a user-made synth; built-in synths (no owner) are not editable. */
export function canEditSynth(actor: Actor | null, synth: { ownerId: string | null }): boolean {
  return actor !== null && synth.ownerId !== null && (synth.ownerId === actor.id || isAdmin(actor));
}

/**
 * Approved synths are visible to everyone. Until an admin approves it, a synth (with its patches) is visible
 * only to its owner and to admins. The database queries apply the same rule (see visibleSynthCondition).
 */
export function canSeeSynth(actor: Actor | null, synth: { ownerId: string | null; approvedAt: Date | null }): boolean {
  return synth.approvedAt !== null || isAdmin(actor) || (actor !== null && synth.ownerId === actor.id);
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

/**
 * Whether an admin may activate, deactivate or verify an account: never their own (no locking out) and never the
 * owner's; other admins' only for the owner.
 */
export function canManageUser(actor: Actor | null, target: { id: string; role: string }): boolean {
  if (!actor || !isAdmin(actor) || target.id === actor.id || target.role === "owner") return false;
  return actor.role === "owner" || target.role === "user";
}

/** Only the owner changes roles, between user and admin, of other accounts. */
export function canChangeRole(actor: Actor | null, target: { id: string; role: string }): boolean {
  return actor?.role === "owner" && target.id !== actor.id && target.role !== "owner";
}
