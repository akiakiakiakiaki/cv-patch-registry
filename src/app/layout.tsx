import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { I18nProvider } from "@/i18n/provider";
import { resolveLocale } from "@/i18n/config";
import { translate } from "@/i18n/messages";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { AppProviders } from "@/components/app-providers/AppProviders";
import { COLOR_MODE_STORAGE_KEY } from "@/components/app-providers/theme";
import "./globals.scss";

async function requestLocale() {
  return resolveLocale({
    acceptLanguage: (await headers()).get("accept-language"),
  });
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale();
  return {
    title: "CV Patch Registry",
    description: translate(locale, "metadata.description"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const locale = await requestLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <InitColorSchemeScript
          attribute="class"
          defaultMode="system"
          modeStorageKey={COLOR_MODE_STORAGE_KEY}
        />
        <AppRouterCacheProvider>
          <AppProviders>
            <I18nProvider locale={locale}>{children}</I18nProvider>
          </AppProviders>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
