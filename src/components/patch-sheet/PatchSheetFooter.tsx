"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { PAGE_GUTTER } from "@/components/app-shell/layout";
import { formatTimestamp } from "@/lib/utils/date-format";
import { useI18n } from "@/i18n/provider";

/** Where patches are kept, and a short summary of the active patch. */
export function PatchSheetFooter({
  accountMode,
  knobCount,
  cableCount,
  updatedAt,
}: {
  accountMode: boolean;
  knobCount: number;
  cableCount: number;
  updatedAt: string;
}) {
  const { locale, t } = useI18n();
  return (
    <Box
      component="footer"
      sx={{ display: "flex", justifyContent: "space-between", gap: 2, px: PAGE_GUTTER, py: 1, color: "text.secondary", flexDirection: { xs: "column", md: "row" } }}
    >
      <Typography variant="caption">{accountMode ? t("footer.accountSaved") : t("footer.autosave")}</Typography>
      <Typography variant="caption" sx={{ fontFamily: "monospace", textAlign: { xs: "left", md: "right" } }}>
        {knobCount} {t("footer.knobs")} · {cableCount} {t("footer.cables")} · {t("footer.lastChanged")} {formatTimestamp(updatedAt, locale)}
      </Typography>
    </Box>
  );
}
