"use client";

import type { ReactNode } from "react";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { appTheme, COLOR_MODE_STORAGE_KEY } from "./theme";

export function AppProviders({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ThemeProvider
      theme={appTheme}
      defaultMode="system"
      modeStorageKey={COLOR_MODE_STORAGE_KEY}
      disableTransitionOnChange
    >
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
