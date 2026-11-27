"use client";

import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { PAGE_GUTTER } from "@/components/app-shell/layout";
import { useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/messages";

/** The admin area's sections, in the order of the side pane. */
const SECTIONS: ReadonlyArray<{ href: string; label: MessageKey }> = [
  { href: "/admin/synths", label: "admin.synths.nav" },
  { href: "/admin/users", label: "admin.users.nav" },
];

/** Admin area: a side pane with the sections, the selected section's page beside it. */
export function AdminLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <Box
      component="main"
      sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "220px minmax(0, 1fr)" }, gap: 3, p: PAGE_GUTTER, alignItems: "start" }}
    >
      <Paper component="nav" variant="outlined" aria-label={t("admin.title")}>
        <Typography variant="overline" component="h1" sx={{ display: "block", px: 2, pt: 1 }}>
          {t("admin.title")}
        </Typography>
        <List dense>
          {SECTIONS.map((section) => {
            const current = pathname === section.href || pathname.startsWith(`${section.href}/`);
            return (
              <ListItemButton key={section.href} component={NextLink} href={section.href} selected={current} aria-current={current ? "page" : undefined}>
                <ListItemText primary={t(section.label)} />
              </ListItemButton>
            );
          })}
        </List>
      </Paper>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Box>
  );
}
