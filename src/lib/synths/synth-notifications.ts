import type { Database } from "@/lib/db/client";
import { DEFAULT_LOCALE } from "@/i18n/config";
import type { Mailer } from "@/lib/mail/mailer";
import { mailActiveAdmins } from "@/lib/mail/admin-mail";
import { synthPendingMail } from "@/lib/mail/mail-templates";

/**
 * Tells every active admin (but the creator) that a new synth waits for approval. Never fails: a mail that cannot
 * be sent must not undo or block the synth; it is reported in the result instead.
 */
export async function notifyAdminsOfPendingSynth(
  db: Database,
  mailer: Mailer,
  details: { synthName: string; creator: { id: string; name: string; email: string }; reviewUrl: string },
): Promise<{ sent: number; failed: number }> {
  const content = synthPendingMail(DEFAULT_LOCALE, {
    synthName: details.synthName,
    creatorName: details.creator.name,
    creatorEmail: details.creator.email,
    reviewUrl: details.reviewUrl,
  });
  return mailActiveAdmins(db, mailer, content, details.creator.id);
}
