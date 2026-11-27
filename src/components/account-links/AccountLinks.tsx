"use client";

import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import NextLink from "next/link";
import { authClient } from "@/lib/auth/client";
import { isAdminRole, roleForUser } from "@/lib/auth/roles";
import { confirmLeave } from "@/lib/navigation/leave-guard";
import { useI18n } from "@/i18n/provider";

/** Explore, admin (admins only) and account navigation links. */
export function AccountLinks() {
  const { t } = useI18n();
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return null;

  return (
    <Stack direction="row" spacing={1}>
      <Button color="inherit" size="small" component={NextLink} href="/explore">
        {t("auth.explore")}
      </Button>
      {isAdminRole(roleForUser(session?.user)) ? (
        <Button color="inherit" size="small" component={NextLink} href="/admin">
          {t("admin.nav")}
        </Button>
      ) : null}
      {session ? (
        <Button
          color="inherit"
          size="small"
          onClick={async () => {
            // Unsaved work (e.g. in the synth editor) is asked about first; staying cancels the sign-out.
            if (!(await confirmLeave())) return;
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
