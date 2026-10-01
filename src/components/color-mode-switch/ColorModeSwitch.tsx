"use client";

import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { useColorScheme } from "@mui/material/styles";
import { useI18n } from "@/i18n/provider";

export function ColorModeSwitch() {
  const { mode, systemMode, setMode } = useColorScheme();
  const { t } = useI18n();
  const resolvedMode = mode === "system" ? systemMode : mode;
  if (mode === undefined || resolvedMode === undefined) return null;

  const isDark = resolvedMode === "dark";
  const label = isDark ? t("theme.switchToLight") : t("theme.switchToDark");

  return (
    <Tooltip title={label}>
      <IconButton
        color="inherit"
        size="small"
        aria-label={label}
        onClick={() => setMode(isDark ? "light" : "dark")}
      >
        {isDark ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
}
