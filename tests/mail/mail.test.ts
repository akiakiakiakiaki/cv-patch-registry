import { afterEach, describe, expect, it, vi } from "vitest";
import { MailConfigError, readMailConfig } from "@/lib/mail/mail-config";
import { emailVerificationMail, passwordResetMail, synthPendingMail } from "@/lib/mail/mail-templates";
import { translate } from "@/i18n/messages";
import { MailDeliveryError } from "@/lib/mail/mail-types";
import { createMailer } from "@/lib/mail/mailer";
import { BrevoMailProvider } from "@/lib/mail/providers/brevo-mail-provider";
import { ConsoleMailProvider } from "@/lib/mail/providers/console-mail-provider";

afterEach(() => vi.unstubAllGlobals());

describe("mail settings", () => {
  it("prints mails to the console outside production unless configured otherwise", () => {
    const config = readMailConfig({ NODE_ENV: "development" });
    expect(config.provider).toBeInstanceOf(ConsoleMailProvider);
    expect(config.from).toEqual({ email: "noreply@localhost", name: "CV Patch Registry" });
  });

  it("needs a provider in production and everything that provider needs", () => {
    expect(() => readMailConfig({ NODE_ENV: "production" })).toThrow(MailConfigError);
    expect(() => readMailConfig({ NODE_ENV: "production", MAIL_PROVIDER: "brevo", MAIL_FROM_ADDRESS: "noreply@example.com" })).toThrow("BREVO_API_KEY is required");
    expect(() => readMailConfig({ MAIL_PROVIDER: "brevo", BREVO_API_KEY: "k" })).toThrow("MAIL_FROM_ADDRESS is required");
    expect(() => readMailConfig({ MAIL_PROVIDER: "carrier-pigeon" })).toThrow("Unknown MAIL_PROVIDER: carrier-pigeon (known: console, brevo)");
    const brevo = readMailConfig({ NODE_ENV: "production", MAIL_PROVIDER: "brevo", BREVO_API_KEY: "k", MAIL_FROM_ADDRESS: "noreply@example.com", MAIL_FROM_NAME: "Patches" });
    expect(brevo.provider).toBeInstanceOf(BrevoMailProvider);
    expect(brevo.from).toEqual({ email: "noreply@example.com", name: "Patches" });
  });
});

describe("Brevo", () => {
  const message = { to: { email: "ada@example.test", name: "Ada" }, subject: "Hi", text: "Hello", html: "<p>Hello</p>" };

  it("sends through the transactional API with the API key", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messageId: "m1" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await new BrevoMailProvider("secret-key").send(message, { email: "noreply@example.com", name: "Patches" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.headers).toMatchObject({ "api-key": "secret-key", "content-type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({
      sender: { email: "noreply@example.com", name: "Patches" },
      to: [{ email: "ada@example.test", name: "Ada" }],
      subject: "Hi",
      textContent: "Hello",
      htmlContent: "<p>Hello</p>",
    });
  });

  it("sends attachments base64-encoded", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const attachments = [{ name: "data.zip", content: new TextEncoder().encode("PK") }];
    await new BrevoMailProvider("secret-key").send({ ...message, attachments }, { email: "noreply@example.com", name: "Patches" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).attachment).toEqual([{ name: "data.zip", content: "UEs=" }]);
  });

  it("reports a refused mail with Brevo's answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"code":"unauthorized","message":"Key not found"}', { status: 401 })));
    const sending = new BrevoMailProvider("wrong").send(message, { email: "noreply@example.com", name: "Patches" });
    await expect(sending).rejects.toBeInstanceOf(MailDeliveryError);
    await expect(sending).rejects.toThrow("brevo did not accept the mail: status 401");
  });
});

describe("mailer", () => {
  it("sends the app's content through the configured provider and sender", async () => {
    const send = vi.fn(async () => undefined);
    const mailer = createMailer({ provider: { name: "test", send }, from: { email: "noreply@example.com", name: "Patches" } });
    await mailer.send({ email: "ada@example.test" }, passwordResetMail("en", "https://app.example/reset"));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: { email: "ada@example.test" }, subject: "Reset your password" }), { email: "noreply@example.com", name: "Patches" });
  });
});

describe("mail texts", () => {
  it("are in the reader's language, with the link as a button and as text", () => {
    const de = emailVerificationMail("de", "https://app.example/verify?token=a&b=1");
    expect(de.subject).toBe("Bitte bestätige deine E-Mail-Adresse");
    expect(de.text).toContain("https://app.example/verify?token=a&b=1");
    expect(de.html).toContain('href="https://app.example/verify?token=a&amp;b=1"');
    expect(emailVerificationMail("en", "https://x").subject).toBe("Please confirm your email address");
  });

  it("escape what users typed", () => {
    const mail = synthPendingMail("en", { synthName: "<b>Evil</b>", creatorName: "Ada", creatorEmail: "ada@example.test", reviewUrl: "https://app.example/admin/synths" });
    expect(mail.subject).toBe("New synth awaits approval: <b>Evil</b>");
    expect(mail.html).toContain("&lt;b&gt;Evil&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>Evil</b>");
    expect(mail.text).toContain("Ada (ada@example.test) created the synth “<b>Evil</b>”");
  });

  it("come from the language files with every placeholder filled", () => {
    for (const locale of ["de", "en"] as const) {
      const details = { synthName: "Proton", creatorName: "Ada", creatorEmail: "ada@example.test", reviewUrl: "https://x/admin" };
      const mails = [emailVerificationMail(locale, "https://x"), passwordResetMail(locale, "https://x"), synthPendingMail(locale, details)];
      for (const mail of mails) {
        expect(`${mail.subject}\n${mail.text}\n${mail.html}`).not.toMatch(/\{\w+\}|mail\.\w/);
      }
      expect(passwordResetMail(locale, "https://x").subject).toBe(translate(locale, "mail.reset.subject"));
      expect(synthPendingMail(locale, details).html).toContain(translate(locale, "brand.title"));
    }
  });
});
