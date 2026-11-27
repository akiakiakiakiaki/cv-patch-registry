import type { Database } from "@/lib/db/client";
import type { MailContent } from "@/lib/mail/mail-templates";
import type { Mailer } from "@/lib/mail/mailer";
import { listActiveAdmins } from "@/lib/repositories/users-repository";

/**
 * Sends one mail to every active admin and the owner, except the account that caused it. Never rejects; how many
 * mails went out and how many failed is in the result, so each caller decides what a failure means.
 */
export async function mailActiveAdmins(
  db: Database,
  mailer: Mailer,
  content: MailContent,
  exceptUserId: string,
): Promise<{ sent: number; failed: number }> {
  const admins = await listActiveAdmins(db, exceptUserId);
  const results = await Promise.allSettled(admins.map((admin) => mailer.send(admin, content)));
  const failed = results.filter((result) => result.status === "rejected").length;
  return { sent: results.length - failed, failed };
}
