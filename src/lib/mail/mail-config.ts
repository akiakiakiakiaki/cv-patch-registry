import type { MailProvider } from "@/lib/mail/mail-types";
import { BrevoMailProvider } from "@/lib/mail/providers/brevo-mail-provider";
import { ConsoleMailProvider } from "@/lib/mail/providers/console-mail-provider";

/**
 * Mail settings, all from the environment:
 * - MAIL_PROVIDER: "console" (default outside production) or "brevo"; required in production.
 * - MAIL_FROM_ADDRESS, MAIL_FROM_NAME: the sender, on a domain the service has verified.
 * - BREVO_API_KEY: for MAIL_PROVIDER=brevo.
 * Another service = one provider class plus one entry in PROVIDERS.
 */
export interface MailConfig {
  provider: MailProvider;
  from: { email: string; name: string };
}

type Env = Readonly<Record<string, string | undefined>>;

const PROVIDERS: Readonly<Record<string, (env: Env) => MailProvider>> = {
  console: () => new ConsoleMailProvider(),
  brevo: (env) => new BrevoMailProvider(required(env, "BREVO_API_KEY")),
};

export class MailConfigError extends Error {}

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new MailConfigError(`${name} is required for MAIL_PROVIDER=${env.MAIL_PROVIDER}`);
  return value;
}

/** Reads and checks the settings; throws MailConfigError with what is missing. */
export function readMailConfig(env: Env = process.env): MailConfig {
  const name = env.MAIL_PROVIDER?.trim() || (env.NODE_ENV === "production" ? "" : "console");
  if (!name) throw new MailConfigError("MAIL_PROVIDER must be set in production (e.g. brevo)");
  const create = PROVIDERS[name];
  if (!create) throw new MailConfigError(`Unknown MAIL_PROVIDER: ${name} (known: ${Object.keys(PROVIDERS).join(", ")})`);
  // Mails printed to the console need no real sender.
  const fromEmail = name === "console" ? env.MAIL_FROM_ADDRESS?.trim() || "noreply@localhost" : required(env, "MAIL_FROM_ADDRESS");
  return { provider: create(env), from: { email: fromEmail, name: env.MAIL_FROM_NAME?.trim() || "CV Patch Registry" } };
}
