import type { MailMessage, MailProvider } from "@/lib/mail/mail-types";

/** Local development: prints each mail, links included, to the server console instead of sending it. */
export class ConsoleMailProvider implements MailProvider {
  readonly name = "console";

  async send(message: MailMessage, from: { email: string; name: string }): Promise<void> {
    const files = (message.attachments ?? []).map((file) => `\n[attachment] ${file.name} (${file.content.byteLength} bytes)`).join("");
    console.info(`[mail] from=${from.email} to=${message.to.email} subject="${message.subject}"\n${message.text}${files}`);
  }
}
