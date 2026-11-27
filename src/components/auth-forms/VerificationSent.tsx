"use client";

import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { authClient } from "@/lib/auth/client";
import { useI18n } from "@/i18n/provider";
import { WELCOME_PATH } from "@/components/welcome/WelcomeNotice";

/** How long "send again" waits after each mail. The server limits it as well (see rateLimit in lib/auth). */
export const RESEND_COOLDOWN_SECONDS = 60;

type ResendState = "idle" | "sending" | "sent" | "failed";

/** Replaces the registration form once the confirmation mail is out: where it went, and a way to get another one. */
export function VerificationSent({ email, onUseOtherAddress }: { email: string; onUseOtherAddress: () => void }) {
  const { t } = useI18n();
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);
  const [state, setState] = useState<ResendState>("idle");

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setTimeout(() => setSecondsLeft((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  async function resend() {
    setState("sending");
    let failed = false;
    try {
      failed = Boolean((await authClient.sendVerificationEmail({ email, callbackURL: WELCOME_PATH })).error);
    } catch {
      failed = true;
    }
    setState(failed ? "failed" : "sent");
    setSecondsLeft(RESEND_COOLDOWN_SECONDS);
  }

  const waiting = secondsLeft > 0;
  return (
    <Stack spacing={2} role="status">
      <Typography>{t("auth.checkMailTo", { email })}</Typography>
      <Typography variant="body2" color="text.secondary">
        {t("auth.checkMailSpam")}
      </Typography>
      {state === "sent" && <Alert severity="success">{t("auth.resendDone")}</Alert>}
      {state === "failed" && <Alert severity="error">{t("auth.resendFailed")}</Alert>}
      <Stack spacing={1} sx={{ alignItems: "center" }}>
        <Typography variant="body2">{t("auth.noMailYet")}</Typography>
        <Button variant="outlined" onClick={() => void resend()} disabled={waiting || state === "sending"}>
          {waiting ? t("auth.resendIn", { seconds: secondsLeft }) : t("auth.resend")}
        </Button>
      </Stack>
      <Link component="button" type="button" variant="body2" onClick={onUseOtherAddress} sx={{ alignSelf: "center" }}>
        {t("auth.useOtherAddress")}
      </Link>
    </Stack>
  );
}
