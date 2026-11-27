import { MailDeliveryError, type MailMessage, type MailProvider } from "@/lib/mail/mail-types";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

/** Brevo's transactional email API (https://developers.brevo.com/reference/sendtransacemail). */
export class BrevoMailProvider implements MailProvider {
  readonly name = "brevo";

  constructor(private readonly apiKey: string) {}

  async send(message: MailMessage, from: { email: string; name: string }): Promise<void> {
    const response = await fetch(BREVO_SEND_URL, {
      method: "POST",
      headers: { "api-key": this.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: from.email, name: from.name },
        to: [message.to.name ? { email: message.to.email, name: message.to.name } : { email: message.to.email }],
        subject: message.subject,
        textContent: message.text,
        htmlContent: message.html,
        ...(message.attachments?.length
          ? { attachment: message.attachments.map((file) => ({ name: file.name, content: Buffer.from(file.content).toString("base64") })) }
          : {}),
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
      throw new MailDeliveryError(this.name, `status ${response.status}${detail ? `: ${detail}` : ""}`);
    }
  }
}
