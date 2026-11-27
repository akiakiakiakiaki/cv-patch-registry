/** A mail as the app writes it, independent of the service that delivers it. */
export interface MailMessage {
  to: { email: string; name?: string };
  subject: string;
  /** Plain-text body; every mail has one, for clients without HTML. */
  text: string;
  html: string;
  attachments?: readonly MailAttachment[];
}

/** A file sent with a mail, e.g. a data export. */
export interface MailAttachment {
  /** File name the recipient sees. */
  name: string;
  content: Uint8Array;
}

/**
 * One mail delivery service (Brevo, the console, later e.g. Resend). The only thing the app needs from it; everything
 * else (who gets which mail, what it says) is the app's own logic. Rejects when the service does not accept the mail.
 */
export interface MailProvider {
  readonly name: string;
  send(message: MailMessage, from: { email: string; name: string }): Promise<void>;
}

export class MailDeliveryError extends Error {
  constructor(provider: string, detail: string) {
    super(`${provider} did not accept the mail: ${detail}`);
  }
}
