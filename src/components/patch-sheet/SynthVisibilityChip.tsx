"use client";

import Chip from "@mui/material/Chip";
import PublicIcon from "@mui/icons-material/Public";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOffOutlined";
import { useI18n } from "@/i18n/provider";

/**
 * Who can see the synth, for its owner and admins: until an admin approves it, only they do;
 * afterwards everyone.
 */
export function SynthVisibilityChip({ approved, ownedByViewer }: { approved: boolean; ownedByViewer: boolean }) {
  const { t } = useI18n();
  const label = approved ? t("synths.visibilityApproved") : ownedByViewer ? t("synths.visibilityPendingOwn") : t("synths.visibilityPendingOthers");
  return (
    <Chip
      role="status"
      size="small"
      variant="outlined"
      color={approved ? "success" : "warning"}
      icon={approved ? <PublicIcon /> : <VisibilityOffIcon />}
      label={label}
    />
  );
}
