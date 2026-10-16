"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import NextLink from "next/link";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { authClient } from "@/lib/auth/client";
import { useI18n } from "@/i18n/provider";

/** Asks for a reset link. The answer is the same whether or not the address has an account. */
export function ForgotPasswordForm() {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    setPending(true);
    try {
      await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    } finally {
      setPending(false);
      setSent(true);
    }
  }

  return (
    <Box component="form" onSubmit={submit} noValidate sx={{ width: "100%", maxWidth: 420 }}>
      <Stack spacing={2}>
        <Typography variant="h1" sx={{ fontSize: "1.5rem" }}>{t("auth.forgotTitle")}</Typography>
        <TextField name="email" type="email" label={t("auth.email")} autoComplete="email" required fullWidth />
        {sent ? <Alert severity="info" role="status">{t("auth.resetRequested")}</Alert> : null}
        <Button type="submit" variant="contained" disabled={pending}>{t("auth.forgotSubmit")}</Button>
        <Link component={NextLink} href="/login" variant="body2">{t("auth.backToLogin")}</Link>
      </Stack>
    </Box>
  );
}

/** Sets a new password with the token from the mail link. */
export function ResetPasswordForm() {
  const { t } = useI18n();
  const token = useSearchParams().get("token");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (newPassword !== confirm) return setError(t("auth.passwordMismatch"));
    if (!token) return setError(t("auth.resetTokenMissing"));
    setPending(true);
    setError(null);
    const { error: resetError } = await authClient.resetPassword({ newPassword, token });
    setPending(false);
    if (resetError) return setError(resetError.status === 400 ? t("auth.resetTokenInvalid") : t("auth.serverError"));
    setDone(true);
  }

  if (done) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 420 }}>
        <Alert severity="success" role="status">{t("auth.resetDone")}</Alert>
        <Link component={NextLink} href="/login">{t("auth.login")}</Link>
      </Stack>
    );
  }

  return (
    <Box component="form" onSubmit={submit} noValidate sx={{ width: "100%", maxWidth: 420 }}>
      <Stack spacing={2}>
        <Typography variant="h1" sx={{ fontSize: "1.5rem" }}>{t("auth.resetTitle")}</Typography>
        <TextField name="password" type="password" label={t("auth.newPassword")} autoComplete="new-password" helperText={t("auth.passwordHint")} required fullWidth />
        <TextField name="confirm" type="password" label={t("auth.confirmPassword")} autoComplete="new-password" required fullWidth />
        {error ? <Alert severity="error" role="alert">{error}</Alert> : null}
        <Button type="submit" variant="contained" disabled={pending}>{t("auth.resetSubmit")}</Button>
      </Stack>
    </Box>
  );
}
