import { DEFAULT_LOCALE } from "@/i18n/config";
import type { Database } from "@/lib/db/client";
import { mailActiveAdmins } from "@/lib/mail/admin-mail";
import { deletionRequestedMail } from "@/lib/mail/mail-templates";
import type { Mailer } from "@/lib/mail/mailer";
import { findUserById, updateUserAdminFields } from "@/lib/repositories/users-repository";

/**
 * A user asks for their own account to be deleted: the admins hear about it, then the account is deactivated until
 * an admin deletes it for good (see deleteUserForGood). When no admin could be told, nothing changes, so a request
 * never goes unnoticed. The owner cannot ask: nobody could act on it, and the app would lose its owner.
 */
export async function requestAccountDeletion(
  deps: { db: Database; mailer: Mailer },
  userId: string,
  reviewUrl: string,
): Promise<{ ok: true } | { ok: false; error: "forbidden" | "not-found" | "mail-failed" }> {
  const account = await findUserById(deps.db, userId);
  if (!account || account.disabledAt || account.deletedAt) return { ok: false, error: "not-found" };
  if (account.role === "owner") return { ok: false, error: "forbidden" };

  const content = deletionRequestedMail(DEFAULT_LOCALE, { name: account.name, email: account.email, reviewUrl });
  const { sent, failed } = await mailActiveAdmins(deps.db, deps.mailer, content, userId);
  if (sent === 0 && failed > 0) return { ok: false, error: "mail-failed" };
  if (failed > 0) console.error(`[users] deletion request: ${failed} admin mail(s) failed`);

  await updateUserAdminFields(deps.db, userId, { disabledAt: new Date() });
  return { ok: true };
}
