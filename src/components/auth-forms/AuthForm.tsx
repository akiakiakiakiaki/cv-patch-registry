"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import NextLink from "next/link";
import { authClient } from "@/lib/auth/client";
import { useI18n } from "@/i18n/provider";

export type AuthMode = "login" | "register";

const REQUIRE_EMAIL_VERIFICATION = process.env.NEXT_PUBLIC_AUTH_REQUIRE_EMAIL_VERIFICATION === "true";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setPending(true);
    setError(null);
    setInfo(null);

    if (mode === "register") {
      const name = String(form.get("name") ?? "");
      const { error: signUpError } = await authClient.signUp.email({ name, email, password });
      setPending(false);
      if (signUpError) {
        setError(t("auth.registerError"));
        return;
      }
      if (REQUIRE_EMAIL_VERIFICATION) {
        setInfo(t("auth.checkMail"));
        return;
      }
      router.push("/");
      return;
    }

    let signInError: { status?: number } | null = null;
    try {
      signInError = (await authClient.signIn.email({ email, password })).error ?? null;
    } catch {
      signInError = { status: 0 };
    }
    setPending(false);
    if (signInError) {
      // Only a 401 means wrong credentials. Anything else (403, server or network errors) is reported as such.
      if (signInError.status === 401) setError(t("auth.invalidCredentials"));
      else if (signInError.status === 403) setError(t("auth.notVerified"));
      else setError(t("auth.serverError"));
      return;
    }
    router.push("/");
  }

  return (
    <Paper
      component="section"
      variant="outlined"
      sx={{
        width: "100%",
        maxWidth: 440,
        p: { xs: 3, sm: 4 },
        borderRadius: 3,
        boxShadow: 3,
      }}
    >
      <Stack component="form" onSubmit={handleSubmit} noValidate spacing={2.5}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          {mode === "register" ? t("auth.registerTitle") : t("auth.loginTitle")}
        </Typography>
        {mode === "register" && (
          <TextField name="name" label={t("auth.name")} autoComplete="name" required fullWidth />
        )}
        <TextField name="email" type="email" label={t("auth.email")} autoComplete="email" required fullWidth />
        <TextField
          name="password"
          type="password"
          label={t("auth.password")}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          helperText={mode === "register" ? t("auth.passwordHint") : undefined}
          required
          fullWidth
        />
        {error && <Alert severity="error" role="alert">{error}</Alert>}
        {info && <Alert severity="info" role="status">{info}</Alert>}
        <Button type="submit" variant="contained" size="large" disabled={pending}>
          {mode === "register" ? t("auth.registerSubmit") : t("auth.loginSubmit")}
        </Button>
        {mode === "login" ? (
          <Link component={NextLink} href="/forgot-password" variant="body2" align="center">
            {t("auth.forgotPassword")}
          </Link>
        ) : null}
        <Link
          component={NextLink}
          href={mode === "login" ? "/register" : "/login"}
          variant="body2"
          align="center"
          underline="hover"
        >
          {t(mode === "login" ? "auth.goToRegister" : "auth.goToLogin")}
        </Link>
      </Stack>
    </Paper>
  );
}
