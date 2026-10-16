"use client";

import Button from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ColorModeSwitch } from "@/components/color-mode-switch/ColorModeSwitch";
import { useI18n } from "@/i18n/provider";

export function AppFooter() {
  const { locale, setLocale, t } = useI18n();

  return (
    <Box
      component="footer"
      sx={{
        mt: "auto",
        px: { xs: 2, md: 3 },
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
        <Typography variant="caption">{t("brand.title")} · {t("brand.subtitle")}</Typography>
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
