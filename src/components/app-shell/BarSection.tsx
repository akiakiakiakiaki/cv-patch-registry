import Paper from "@mui/material/Paper";
import type { SxProps, Theme } from "@mui/material/styles";
import type { ReactNode } from "react";
import { PAGE_GUTTER } from "@/components/app-shell/layout";

/** A full-width bar below the header (synth bar, patch settings): page gutter and a divider below. */
export function BarSection({ children, py = 1, sx }: { children: ReactNode; py?: number; sx?: SxProps<Theme> }) {
  return (
    <Paper
      component="section"
      square
      elevation={0}
      sx={[{ borderBottom: 1, borderColor: "divider", px: PAGE_GUTTER, py }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {children}
    </Paper>
  );
}
