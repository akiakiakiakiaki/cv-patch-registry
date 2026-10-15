"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
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

    const { error: signInError } = await authClient.signIn.email({ email, password });
    setPending(false);
    if (signInError) {
      setError(signInError.status === 403 ? t("auth.notVerified") : t("auth.invalidCredentials"));
      return;
    }
    router.push("/");
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate sx={{ width: "100%", maxWidth: 420 }}>
      <Stack spacing={2}>
        <Typography variant="h1" sx={{ fontSize: "1.5rem" }}>
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
        <Button type="submit" variant="contained" disabled={pending}>
          {mode === "register" ? t("auth.registerSubmit") : t("auth.loginSubmit")}
        </Button>
      </Stack>
    </Box>
  );
}
