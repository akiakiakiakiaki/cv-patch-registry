"use client";

import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import { useI18n } from "@/i18n/provider";

/** Panel zoom while placing controls: 100 % is the full available width; each step adds or removes 50 %. */
export const ZOOM_STEP = 0.5;
export const ZOOM_MAX = 2.5;

/** Zoom out, level, zoom in and reset, as one compact group. */
export function ZoomControls({ zoom, onZoomChange }: { zoom: number; onZoomChange: (zoom: number) => void }) {
  const { t } = useI18n();
  return (
    <Paper variant="outlined" role="group" aria-label={t("synths.zoomGroup")} sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 0.5 }}>
      <IconButton size="small" aria-label={t("synths.zoomOut")} disabled={zoom <= 1} onClick={() => onZoomChange(Math.max(1, zoom - ZOOM_STEP))}>
        <ZoomOutIcon fontSize="small" />
      </IconButton>
      <Typography variant="caption" aria-live="polite" sx={{ minWidth: 40, textAlign: "center", alignSelf: "center" }}>
        {t("synths.zoomLevel", { percent: Math.round(zoom * 100) })}
      </Typography>
      <IconButton size="small" aria-label={t("synths.zoomIn")} disabled={zoom >= ZOOM_MAX} onClick={() => onZoomChange(Math.min(ZOOM_MAX, zoom + ZOOM_STEP))}>
        <ZoomInIcon fontSize="small" />
      </IconButton>
      <IconButton size="small" aria-label={t("synths.zoomReset")} disabled={zoom === 1} onClick={() => onZoomChange(1)}>
        <FitScreenIcon fontSize="small" />
      </IconButton>
    </Paper>
  );
}
