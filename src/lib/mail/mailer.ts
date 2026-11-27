import { readMailConfig, type MailConfig } from "@/lib/mail/mail-config";
import type { MailContent } from "@/lib/mail/mail-templates";

/** Sends the app's mails through the configured service (see mail-config); the only way the app sends mail. */
export interface Mailer {
  send(to: { email: string; name?: string }, content: MailContent): Promise<void>;
}

export function createMailer(config: MailConfig): Mailer {
  return { send: (to, content) => config.provider.send({ to, ...content }, config.from) };
}

let instance: Mailer | undefined;

/** The app's mailer, configured on first use, so a missing setting only fails when a mail is due. */
export function getMailer(): Mailer {
  instance ??= createMailer(readMailConfig());
  return instance;
}
