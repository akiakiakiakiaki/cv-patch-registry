import type { Database } from "@/lib/db/client";
import { canChangeRole, canManageUser, isAdmin, type Actor } from "@/lib/domain/policy";
import { findUserById, listUsers, updateUserAdminFields } from "@/lib/repositories/users-repository";

/** One account in the admin's user list. */
export interface UserAdminItem {
  id: string;
  name: string;
  email: string;
  role: string;
  emailVerified: boolean;
  /** False once an admin deactivated the account. */
  active: boolean;
  /** ISO date of the registration. */
  createdAt: string;
  isSelf: boolean;
  /** Whether the viewing admin may (de)activate and verify it, and change its role (see policy). */
  canManage: boolean;
  canChangeRole: boolean;
}

/** Every account, newest first, for admins only (null otherwise). */
export async function listUsersForAdminArea(db: Database, actor: Actor | null): Promise<UserAdminItem[] | null> {
  if (!actor || !isAdmin(actor)) return null;
  return (await listUsers(db)).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    emailVerified: row.emailVerified,
    active: row.disabledAt === null,
    createdAt: row.createdAt.toISOString(),
    isSelf: row.id === actor.id,
    canManage: canManageUser(actor, row),
    canChangeRole: canChangeRole(actor, row),
  }));
}

export type UserAdminFailure = { ok: false; error: "forbidden" | "not-found" };
export type UserChange = { active: boolean } | { emailVerified: boolean } | { role: "user" | "admin" };

/**
 * Applies one change to an account, if the actor may (see canManageUser and canChangeRole). A deactivated account
 * keeps its sessions, but every app API refuses it (see requireUser) and it cannot sign in again; the kept session
 * lets the app tell the user why (see AccountDisabledNotice).
 */
export async function changeUser(
  db: Database,
  actor: Actor | null,
  userId: string,
  change: UserChange,
): Promise<{ ok: true; change: UserChange } | UserAdminFailure> {
  if (!actor || !isAdmin(actor)) return { ok: false, error: "forbidden" };
  const target = await findUserById(db, userId);
  if (!target) return { ok: false, error: "not-found" };
  const allowed = "role" in change ? canChangeRole(actor, target) : canManageUser(actor, target);
  if (!allowed) return { ok: false, error: "forbidden" };

  if ("active" in change) {
    await updateUserAdminFields(db, userId, { disabledAt: change.active ? null : (target.disabledAt ?? new Date()) });
  } else if ("emailVerified" in change) {
    await updateUserAdminFields(db, userId, { emailVerified: change.emailVerified });
  } else {
    await updateUserAdminFields(db, userId, { role: change.role });
  }
  return { ok: true, change };
}
