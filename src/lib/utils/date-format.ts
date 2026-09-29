import type { Locale } from '@/i18n/config';

export function formatTimestamp(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return locale === 'de' ? 'Zeit unbekannt' : 'Unknown time';
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
