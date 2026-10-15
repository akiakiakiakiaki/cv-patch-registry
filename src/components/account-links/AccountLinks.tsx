"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import NextLink from "next/link";
import { authClient } from "@/lib/auth/client";
import { useI18n } from "@/i18n/provider";

/** Account actions only. Synths and patches are managed on the start page. */
export function AccountLinks() {
  const { t } = useI18n();
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return null;

  return (
    <Stack direction="row" spacing={1}>
      <Button color="inherit" size="small" component={NextLink} href="/explore">
        {t("auth.explore")}
      </Button>
      {session ? (
        <Button
          color="inherit"
          size="small"
          onClick={async () => {
            await authClient.signOut();
            window.location.assign("/");
          }}
        >
          {t("auth.logout")}
        </Button>
      ) : (
        <>
          <Button color="inherit" size="small" component={NextLink} href="/login">
            {t("auth.login")}
          </Button>
          <Button color="inherit" size="small" component={NextLink} href="/register">
            {t("auth.register")}
          </Button>
        </>
      )}
    </Stack>
  );
}
