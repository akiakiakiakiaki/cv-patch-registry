import { strToU8, zipSync } from "fflate";
import type { Locale } from "@/i18n/config";
import type { Database } from "@/lib/db/client";
import { canChangeRole, canDeleteUser, canManageUser, isAdmin, type Actor } from "@/lib/domain/policy";
import { accountDeletedMail } from "@/lib/mail/mail-templates";
import type { Mailer } from "@/lib/mail/mailer";
import { collectUserData, deleteUserData } from "@/lib/repositories/user-data-repository";
import { findUserById, listUsers, updateUserAdminFields } from "@/lib/repositories/users-repository";
import type { StorageProvider } from "@/lib/storage/storage-provider";

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
  if (!target || target.deletedAt) return { ok: false, error: "not-found" };
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

/**
 * Deletes an account for good (see canDeleteUser and deleteUserData). First mails the user everything stored about
 * them; when that mail cannot be sent nothing is deleted, so no data goes without its copy. Files are removed after
 * the database commit; a file that cannot be removed only leaves an orphan behind.
 */
export async function deleteUserForGood(
  deps: { db: Database; storage: StorageProvider; mailer: Mailer },
  actor: Actor | null,
  userId: string,
  locale: Locale,
): Promise<{ ok: true } | UserAdminFailure | { ok: false; error: "not-deactivated" | "mail-failed" }> {
  if (!actor || !isAdmin(actor)) return { ok: false, error: "forbidden" };
  const target = await findUserById(deps.db, userId);
  if (!target || target.deletedAt) return { ok: false, error: "not-found" };
  if (!canManageUser(actor, target)) return { ok: false, error: "forbidden" };
  if (!canDeleteUser(actor, target)) return { ok: false, error: "not-deactivated" };

  const data = await collectUserData(deps.db, userId);
  if (!data) return { ok: false, error: "not-found" };
  const exportedAt = new Date();
  const json = JSON.stringify({ format: "cv-patch-registry-user-data", version: 1, exportedAt, ...data }, null, 2);
  const baseName = `cv-patch-registry-${exportedAt.toISOString().slice(0, 10)}`;
  // Zipped: mail services refuse .json attachments (Brevo does), and it keeps the mail small.
  const archive = zipSync({ [`${baseName}.json`]: strToU8(json) });
  try {
    await deps.mailer.send({ email: target.email, name: target.name }, accountDeletedMail(locale, { name: `${baseName}.zip`, content: archive }));
  } catch (error) {
    console.error("[users] data export mail failed, account kept", error);
    return { ok: false, error: "mail-failed" };
  }

  const deleted = await deleteUserData(deps.db, userId);
  if (!deleted) return { ok: false, error: "not-found" };
  await Promise.all(deleted.storageKeys.map((key) => deps.storage.remove(key).catch(() => undefined)));
  return { ok: true };
}
