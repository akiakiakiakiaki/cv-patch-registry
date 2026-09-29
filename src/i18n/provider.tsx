"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { isLocale } from "@/i18n/config";
import type { Locale } from "@/i18n/config";
import { translate } from "@/i18n/messages";
import type { MessageKey, MessageValues } from "@/i18n/messages";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, values?: MessageValues) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);
const LOCALE_STORAGE_KEY = "synth-patch-sheet-locale";

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const [activeLocale, setActiveLocale] = useState(locale);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);

  useEffect(() => {
    const savedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(savedLocale)) setActiveLocale(savedLocale);
    setPreferenceLoaded(true);
  }, []);

  useEffect(() => {
    if (preferenceLoaded)
      window.localStorage.setItem(LOCALE_STORAGE_KEY, activeLocale);
  }, [activeLocale, preferenceLoaded]);

  const value: I18nContextValue = {
    locale: activeLocale,
    setLocale: setActiveLocale,
    t: (key, values) => translate(activeLocale, key, values),
  };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context)
    throw new Error("I18nProvider is missing from the component tree.");
  return context;
}
