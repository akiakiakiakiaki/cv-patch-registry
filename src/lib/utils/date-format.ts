import type { Locale } from "@/i18n/config";
import { translate } from "@/i18n/messages";

/** Date and time as the app shows them everywhere; "short" for compact status texts. */
export function formatTimestamp(value: string, locale: Locale, style: "medium" | "short" = "medium"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return translate(locale, "time.unknown");
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-US", { dateStyle: style, timeStyle: "short" }).format(date);
}
