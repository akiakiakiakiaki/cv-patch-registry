"use client";

import { useEffect, useState } from "react";
import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import CelebrationIcon from "@mui/icons-material/Celebration";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import { AppDialog } from "@/components/app-dialog/AppDialog";
import { useI18n } from "@/i18n/provider";

const WELCOME_PARAM = "welcome";
/** Better Auth appends it when the link in the confirmation mail is expired or invalid. */
const ERROR_PARAM = "error";

/** Where a new account lands: right after signing up, or through the link in the confirmation mail. */
export const WELCOME_PATH = `/?${WELCOME_PARAM}=1`;

type Arrival = "welcome" | "link-failed" | null;

/**
 * Greets a new account once on arriving at WELCOME_PATH, or says that the confirmation link did not work.
 * Takes the markers out of the address, so reloading or sharing it shows nothing again. Watches the address, because
 * signing up without a confirmation mail gets here by an in-app navigation, which keeps this component mounted.
 */
export function WelcomeNotice() {
  const { t } = useI18n();
  const [arrival, setArrival] = useState<Arrival>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(WELCOME_PARAM)) return;
    const failed = url.searchParams.has(ERROR_PARAM);
    url.searchParams.delete(WELCOME_PARAM);
    url.searchParams.delete(ERROR_PARAM);
    window.history.replaceState(window.history.state, "", url);
    setArrival(failed ? "link-failed" : "welcome");
  }, [searchParams]);

  const close = () => setArrival(null);
  if (arrival === "link-failed") {
    return (
      <AppDialog
        open
        onClose={close}
        title={t("auth.verifyFailedTitle")}
        icon={<ErrorOutlineIcon color="error" aria-hidden />}
        describedByContent
        actions={
          <>
            <Button onClick={close}>{t("dialog.close")}</Button>
            <Button variant="contained" component={NextLink} href="/login" onClick={close}>
              {t("auth.verifyFailedSignIn")}
            </Button>
          </>
        }
      >
        <Typography>{t("auth.verifyFailedText")}</Typography>
      </AppDialog>
    );
  }
  return (
    <AppDialog
      open={arrival === "welcome"}
      onClose={close}
      title={t("auth.welcomeTitle")}
      icon={<CelebrationIcon color="primary" aria-hidden />}
      describedByContent
      actions={
        <Button variant="contained" onClick={close}>
          {t("auth.welcomeStart")}
        </Button>
      }
    >
      <Typography>{t("auth.welcomeText")}</Typography>
    </AppDialog>
  );
}
