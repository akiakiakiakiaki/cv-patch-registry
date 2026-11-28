"use client";

import Button from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ColorModeSwitch } from "@/components/color-mode-switch/ColorModeSwitch";
import { useI18n } from "@/i18n/provider";
import { PAGE_GUTTER } from "@/components/app-shell/layout";

/**
 * @param developmentMode DEVELOPMENT=true: a notice that this instance runs in development mode on the dev database,
 * so it is not mistaken for production.
 */
export function AppFooter({ developmentMode = false }: { developmentMode?: boolean }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <Box
      component="footer"
      sx={{
        mt: "auto",
        px: PAGE_GUTTER,
        py: 1,
        minHeight: 56,
        display: "flex",
        alignItems: "center",
        borderTop: 1,
        borderColor: "divider",
        color: "text.secondary",
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        sx={{
          width: "100%",
          maxWidth: 1600,
          mx: "auto",
          alignItems: "center",
          justifyContent: "space-between",
          gap: { xs: 1, sm: 2 },
        }}
      >
        <Stack direction={{ xs: "column", sm: "row" }} sx={{ alignItems: "center", columnGap: 2 }}>
          <Typography variant="caption">{t("brand.title")} · {t("brand.subtitle")}</Typography>
          {developmentMode ? (
            <Typography variant="caption" sx={{ color: "primary.main", fontWeight: 600 }}>
              {t("footer.developmentMode")}
            </Typography>
          ) : null}
        </Stack>
        <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
          <ButtonGroup size="small" aria-label={t("language.label")}>
            {(["de", "en"] as const).map((language) => (
              <Button
                key={language}
                aria-pressed={locale === language}
                variant={locale === language ? "contained" : "outlined"}
                onClick={() => setLocale(language)}
              >
                {language.toUpperCase()}
              </Button>
            ))}
          </ButtonGroup>
          <ColorModeSwitch />
        </Stack>
      </Stack>
    </Box>
  );
}
