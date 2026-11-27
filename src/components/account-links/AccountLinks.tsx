"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { AppDialog } from "@/components/app-dialog/AppDialog";
import { useConfirmDialog } from "@/components/confirm-dialog/ConfirmDialog";
import { UserMenu } from "@/components/account-links/UserMenu";
import { api } from "@/lib/api/client";
import { authClient } from "@/lib/auth/client";
import { isAdminRole, roleForUser } from "@/lib/auth/roles";
import { confirmLeave } from "@/lib/navigation/leave-guard";
import { useI18n } from "@/i18n/provider";

/** After asking for deletion: done (the user is signed out already), or the request could not be sent. */
type DeletionNotice = "requested" | "failed" | null;

/** Explore, admin (admins only) and account navigation: sign-in links, or the signed-in user's menu. */
export function AccountLinks() {
  const { t } = useI18n();
  const { data: session, isPending } = authClient.useSession();
  const { confirm, dialog } = useConfirmDialog();
  // Lives here, not in the menu: signing out removes the menu while the notice is still open.
  const [notice, setNotice] = useState<DeletionNotice>(null);
  if (isPending) return null;
  const role = roleForUser(session?.user);

  async function signOut() {
    // Unsaved work (e.g. in the synth editor) is asked about first; staying cancels the sign-out.
    if (!(await confirmLeave())) return;
    await authClient.signOut();
    window.location.assign("/");
  }

  // Once requested the user is signed out already, so closing starts over on the start page.
  const closeNotice = () => (notice === "requested" ? window.location.assign("/") : setNotice(null));

  async function requestDeletion() {
    if (!(await confirmLeave())) return;
    const confirmed = await confirm({
      tone: "danger",
      title: t("account.requestDeletionTitle"),
      content: t("account.requestDeletionText"),
      confirmLabel: t("account.requestDeletion"),
    });
    if (!confirmed) return;
    if (!(await api.account.requestDeletion()).ok) return setNotice("failed");
    setNotice("requested");
    await authClient.signOut();
  }

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Button color="inherit" size="small" component={NextLink} href="/explore">
        {t("auth.explore")}
      </Button>
      {isAdminRole(role) ? (
        <Button color="inherit" size="small" component={NextLink} href="/admin">
          {t("admin.nav")}
        </Button>
      ) : null}
      {session ? (
        <UserMenu
          name={session.user.name}
          canRequestDeletion={role !== "owner"}
          onRequestDeletion={() => void requestDeletion()}
          onSignOut={() => void signOut()}
        />
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
      {dialog}
      <AppDialog
        open={notice !== null}
        onClose={closeNotice}
        title={t(notice === "failed" ? "account.requestDeletionFailedTitle" : "account.requestDeletionDoneTitle")}
        describedByContent
        actions={
          <Button variant="contained" onClick={closeNotice}>
            {t("dialog.close")}
          </Button>
        }
      >
        <Typography>{t(notice === "failed" ? "account.requestDeletionFailed" : "account.requestDeletionDone")}</Typography>
      </AppDialog>
    </Stack>
  );
}
