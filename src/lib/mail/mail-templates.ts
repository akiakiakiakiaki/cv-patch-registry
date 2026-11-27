import type { Locale } from "@/i18n/config";
import type { MailAttachment } from "@/lib/mail/mail-types";
import { translate } from "@/i18n/messages";

/** What a mail says; the service only delivers it. */
export interface MailContent {
  subject: string;
  text: string;
  html: string;
  attachments?: readonly MailAttachment[];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

/** One layout for every mail: heading, paragraphs, an optional button for a link (with the link as text), a note. */
function layout(locale: Locale, parts: { heading: string; paragraphs: string[]; action?: { label: string; url: string }; note?: string }): Omit<MailContent, "subject"> {
  const text = [
    parts.heading,
    "",
    ...parts.paragraphs,
    ...(parts.action ? ["", `${parts.action.label}: ${parts.action.url}`] : []),
    ...(parts.note ? ["", parts.note] : []),
  ].join("\n");
  const action = parts.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(parts.action.url)}" style="display:inline-block;background:#f2a84a;color:#191a1c;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:6px">${escapeHtml(parts.action.label)}</a></p>
<p style="margin:0 0 12px;font-size:12px;color:#526579;word-break:break-all">${escapeHtml(parts.action.url)}</p>
`
    : "";
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f3f0;font-family:Arial,Helvetica,sans-serif;color:#191a1c">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px">
<p style="margin:0 0 16px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#526579">${escapeHtml(translate(locale, "brand.title"))}</p>
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(parts.heading)}</h1>
${parts.paragraphs.map((paragraph) => `<p style="margin:0 0 12px;line-height:1.5">${escapeHtml(paragraph)}</p>`).join("\n")}
${action}${parts.note ? `<p style="margin:16px 0 0;font-size:12px;color:#526579">${escapeHtml(parts.note)}</p>` : ""}
</div></body></html>`;
  return { text, html };
}

/** The standard mail: subject, heading, one paragraph, a button and an optional note, all from mail.<name>.* keys. */
function standardMail(locale: Locale, name: "verify" | "reset", url: string): MailContent {
  const t = (part: "subject" | "heading" | "body" | "action" | "note") => translate(locale, `mail.${name}.${part}`);
  return {
    subject: t("subject"),
    ...layout(locale, { heading: t("heading"), paragraphs: [t("body")], action: { label: t("action"), url }, note: t("note") }),
  };
}

export function emailVerificationMail(locale: Locale, url: string): MailContent {
  return standardMail(locale, "verify", url);
}

export function passwordResetMail(locale: Locale, url: string): MailContent {
  return standardMail(locale, "reset", url);
}

/** To admins: a new synth awaits approval. */
export function synthPendingMail(locale: Locale, details: { synthName: string; creatorName: string; creatorEmail: string; reviewUrl: string }): MailContent {
  const values = { synth: details.synthName, creator: details.creatorName, email: details.creatorEmail };
  return {
    subject: translate(locale, "mail.synthPending.subject", values),
    ...layout(locale, {
      heading: translate(locale, "mail.synthPending.heading"),
      paragraphs: [translate(locale, "mail.synthPending.body", values)],
      action: { label: translate(locale, "mail.synthPending.action"), url: details.reviewUrl },
    }),
  };
}

/** To a user whose account an admin deletes: everything stored about them, attached (see deleteUserForGood). */
export function accountDeletedMail(locale: Locale, dataExport: MailAttachment): MailContent {
  return {
    subject: translate(locale, "mail.accountDeleted.subject"),
    ...layout(locale, {
      heading: translate(locale, "mail.accountDeleted.heading"),
      paragraphs: [translate(locale, "mail.accountDeleted.body"), translate(locale, "mail.accountDeleted.attachment")],
      note: translate(locale, "mail.accountDeleted.note"),
    }),
    attachments: [dataExport],
  };
}

/** To admins: a user asked for their account to be deleted (and is deactivated until then). */
export function deletionRequestedMail(locale: Locale, details: { name: string; email: string; reviewUrl: string }): MailContent {
  const values = { name: details.name, email: details.email };
  return {
    subject: translate(locale, "mail.deletionRequested.subject", values),
    ...layout(locale, {
      heading: translate(locale, "mail.deletionRequested.heading"),
      paragraphs: [translate(locale, "mail.deletionRequested.body", values)],
      action: { label: translate(locale, "mail.deletionRequested.action"), url: details.reviewUrl },
    }),
  };
}
