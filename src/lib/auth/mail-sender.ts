export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailSender {
  send(message: MailMessage): Promise<void>;
}

/** Local development only: prints the message, including verification links, to the server console. */
export class ConsoleMailSender implements MailSender {
  async send(message: MailMessage): Promise<void> {
    console.info(`[mail] to=${message.to} subject="${message.subject}"\n${message.text}`);
  }
}

export function getMailSender(): MailSender {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Email delivery is not configured for production");
  }
  return new ConsoleMailSender();
}
