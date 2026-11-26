"use client";

import { useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { AccountLinks } from "@/components/account-links/AccountLinks";
import { GuestPatchTransfer } from "@/components/guest-transfer/GuestPatchTransfer";
import { InlineSvgAsset } from "@/components/inline-svg-asset/InlineSvgAsset";
import { useI18n } from "@/i18n/provider";
import { PAGE_GUTTER } from "@/components/app-shell/layout";

/** Height of the sticky header, for content that sticks right below it (e.g. the synth editor). */
export const APP_HEADER_HEIGHT_VARIABLE = "--app-header-height";

export function AppHeader() {
  const { t } = useI18n();
  const headerRef = useRef<HTMLElement>(null);

  // The header wraps on narrow screens, so its height is measured instead of assumed.
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const publish = () => document.documentElement.style.setProperty(APP_HEADER_HEIGHT_VARIABLE, `${header.offsetHeight}px`);
    publish();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <Paper
      ref={headerRef}
      component="header"
      square
      elevation={1}
      sx={{
        position: "sticky",
        top: 0,
        zIndex: "appBar",
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <Stack
        direction="row"
        useFlexGap
        sx={{
          maxWidth: 1600,
          mx: "auto",
          px: PAGE_GUTTER,
          py: 1,
          alignItems: "center",
          flexWrap: "wrap",
          gap: { xs: 1, md: 2 },
        }}
      >
        <Stack
          component={NextLink}
          href="/"
          direction="row"
          spacing={1}
          sx={{
            color: "text.primary",
            textDecoration: "none",
            alignItems: "center",
            mr: "auto",
          }}
        >
          <Paper
            elevation={0}
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1,
              bgcolor: "primary.main",
              display: "grid",
              placeItems: "center",
              "html.light & .brandMarkLogo": {
                filter: "brightness(0) invert(1)",
              },
            }}
          >
            <InlineSvgAsset
              className="brandMarkLogo"
              src="/logo.svg"
              ariaHidden
              style={{
                width: 20,
                height: 20,
                display: "grid",
                placeItems: "center",
              }}
            />
          </Paper>
          <Box
            sx={{
              display: "flex",
              alignItems: "baseline",
              gap: 0.75,
              whiteSpace: "nowrap",
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 700 }}
            >
              {t("brand.title")}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
            >
              {t("brand.subtitle")}
            </Typography>
          </Box>
        </Stack>
        <AccountLinks />
        <GuestPatchTransfer />
      </Stack>
    </Paper>
  );
}
