import de from "@/i18n/messages/de.json";
import en from "@/i18n/messages/en.json";
import type { Locale } from "@/i18n/config";

export type MessageKey = keyof typeof de;
export type MessageValues = Readonly<Record<string, string | number>>;

const dictionaries: Record<Locale, Record<MessageKey, string>> = { de, en };

export function isMessageKey(value: string): value is MessageKey {
  return Object.hasOwn(de, value);
}

export function translate(
  locale: Locale,
  key: MessageKey,
  values: MessageValues = {},
): string {
  const message = dictionaries[locale][key];
  return message.replace(/\{([\w.]+)\}/g, (placeholder, name: string) =>
    String(values[name] ?? placeholder),
  );
}
