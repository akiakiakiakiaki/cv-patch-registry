"use client";

import { useEffect } from "react";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import BlockIcon from "@mui/icons-material/Block";
import { AppDialog } from "@/components/app-dialog/AppDialog";
import { UNAUTHORIZED_EVENT } from "@/lib/api/client";
import { authClient } from "@/lib/auth/client";
import { useI18n } from "@/i18n/provider";

async function signOutAndLeave() {
  await authClient.signOut();
  window.location.assign("/");
}

/**
 * Tells a signed-in user that an admin deactivated their account. The app learns it when an API call is refused
 * (401): the session is then read again, and it carries `disabledAt`. Closing the notice signs out.
 */
export function AccountDisabledNotice() {
  const { t } = useI18n();
  const { data: session, refetch } = authClient.useSession();
  const disabled = Boolean(session?.user && (session.user as { disabledAt?: unknown }).disabledAt);

  useEffect(() => {
    if (!session) return;
    const check = () => void refetch();
    window.addEventListener(UNAUTHORIZED_EVENT, check);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, check);
  }, [session, refetch]);

  if (!disabled) return null;
  return (
    <AppDialog
      open
      onClose={() => void signOutAndLeave()}
      title={t("auth.disabledTitle")}
      icon={<BlockIcon color="error" aria-hidden />}
      describedByContent
      actions={
        <Button variant="contained" onClick={() => void signOutAndLeave()}>
          {t("auth.disabledSignOut")}
        </Button>
      }
    >
      <Typography>{t("auth.disabledText")}</Typography>
    </AppDialog>
  );
}
