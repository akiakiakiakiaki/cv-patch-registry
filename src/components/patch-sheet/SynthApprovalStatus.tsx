"use client";

import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import { SavingSwitch } from "@/components/admin/SavingSwitch";
import { api } from "@/lib/api/client";
import { SynthVisibilityChip } from "@/components/patch-sheet/SynthVisibilityChip";
import { useI18n } from "@/i18n/provider";

/**
 * Below the panel, for the synth's owner and admins: who can see the synth. Admins can approve it here,
 * or take the approval back, without going to the admin area.
 */
export function SynthApprovalStatus({
  slug,
  approved,
  ownedByViewer,
  canApprove,
  onApprovalChange,
}: {
  slug: string;
  approved: boolean;
  ownedByViewer: boolean;
  canApprove: boolean;
  /** After a saved change, e.g. to reload the synth and the catalog. */
  onApprovalChange: (approved: boolean) => void;
}) {
  const { t } = useI18n();
  // The status follows the confirmed approval at once, without waiting for the reloaded synth.
  const [confirmed, setConfirmed] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  // Once the reloaded synth carries the approval, it is the source again.
  useEffect(() => setConfirmed(null), [approved]);
  const shown = confirmed ?? approved;

  return (
    <Stack spacing={1}>
      <Stack direction="row" useFlexGap sx={{ alignItems: "center", flexWrap: "wrap", gap: 2 }}>
        <SynthVisibilityChip approved={shown} ownedByViewer={ownedByViewer} />
        {canApprove ? (
          <SavingSwitch
            checked={approved}
            save={async (next) => {
              const response = await api.admin.setSynthApproval(slug, next);
              return response.ok ? response.data.approved : null;
            }}
            // Says what the switch is: "Approve" while waiting, "Approved" once done.
            label={(value) => (value ? t("admin.synths.approved") : t("synths.approve"))}
            onSaved={(value) => {
              setFailed(false);
              setConfirmed(value);
              onApprovalChange(value);
            }}
            onError={() => setFailed(true)}
          />
        ) : null}
      </Stack>
      {failed ? <Alert severity="error">{t("synths.approvalFailed")}</Alert> : null}
    </Stack>
  );
}
