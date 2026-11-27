"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import { useConfirmDialog } from "@/components/confirm-dialog/ConfirmDialog";
import { SavingSpinner } from "@/components/admin/SavingSpinner";
import { SavingSwitch } from "@/components/admin/SavingSwitch";
import { useSavedValue } from "@/components/admin/use-saved-value";
import { api } from "@/lib/api/client";
import type { UserAdminItem } from "@/lib/users/user-admin";
import { formatTimestamp } from "@/lib/utils/date-format";
import { useI18n } from "@/i18n/provider";

type AssignableRole = "user" | "admin";
type Message = { severity: "success" | "error"; text: string };

/**
 * Every account with its role, email confirmation and active switch, and deleting a deactivated account for good.
 * What the viewing admin may change is decided by the server (canManage, canChangeRole, canDeleteUser); the owner
 * and the admin's own account are shown read-only.
 */
export function UserAdminList({ items: initialItems }: { items: readonly UserAdminItem[] }) {
  const { locale, t } = useI18n();
  const { confirm, dialog } = useConfirmDialog();
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState<Message | null>(null);
  const fail = (name: string) => setMessage({ severity: "error", text: t("admin.users.saveFailed", { name }) });

  async function deleteForGood(item: UserAdminItem) {
    const confirmed = await confirm({
      tone: "danger",
      title: t("admin.users.deleteTitle"),
      content: t("admin.users.deleteText", { name: item.name, email: item.email }),
      confirmLabel: t("admin.users.delete"),
    });
    if (!confirmed) return;
    const response = await api.admin.deleteUser(item.id);
    if (!response.ok) {
      const key = response.error === "mail-failed" ? "admin.users.deleteMailFailed" : "admin.users.deleteFailed";
      return setMessage({ severity: "error", text: t(key, { name: item.name }) });
    }
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    setMessage({ severity: "success", text: t("admin.users.deleted", { name: item.name, email: item.email }) });
  }

  return (
    <Stack spacing={2}>
      <div>
        <Typography variant="h5" component="h2">
          {t("admin.users.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("admin.users.intro")}
        </Typography>
      </div>
      {message ? (
        <Alert severity={message.severity} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      ) : null}
      <TableContainer>
        <Table size="small" aria-label={t("admin.users.title")}>
          <TableHead>
            <TableRow>
              <TableCell>{t("admin.users.user")}</TableCell>
              <TableCell>{t("admin.users.role")}</TableCell>
              <TableCell>{t("admin.users.emailVerified")}</TableCell>
              <TableCell>{t("admin.users.active")}</TableCell>
              <TableCell>{t("admin.users.registered")}</TableCell>
              <TableCell align="right">{t("admin.users.actions")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} data-user={item.id}>
                <TableCell>
                  {item.name}
                  {item.isSelf ? <Chip size="small" label={t("admin.users.you")} sx={{ ml: 1 }} /> : null}
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    {item.email}
                  </Typography>
                </TableCell>
                <TableCell>
                  {item.canChangeRole && (item.role === "user" || item.role === "admin") ? (
                    <RoleSelect item={item} role={item.role} onError={() => fail(item.name)} />
                  ) : (
                    t(`admin.users.roleName.${roleKey(item.role)}`)
                  )}
                </TableCell>
                <TableCell>
                  <SavingSwitch
                    checked={item.emailVerified}
                    disabled={!item.canManage}
                    ariaLabel={t("admin.users.emailVerifiedAria", { name: item.name })}
                    save={async (next) => {
                      const response = await api.admin.changeUser(item.id, { emailVerified: next });
                      return response.ok ? response.data.emailVerified : null;
                    }}
                    onError={() => fail(item.name)}
                  />
                </TableCell>
                <TableCell>
                  <SavingSwitch
                    tone="status"
                    checked={item.active}
                    disabled={!item.canManage}
                    ariaLabel={t("admin.users.activeAria", { name: item.name })}
                    save={async (next) => {
                      const response = await api.admin.changeUser(item.id, { active: next });
                      return response.ok ? response.data.active : null;
                    }}
                    onSaved={(active) => setItems((current) => current.map((row) => (row.id === item.id ? { ...row, active } : row)))}
                    onError={() => fail(item.name)}
                  />
                </TableCell>
                <TableCell>{formatTimestamp(item.createdAt, locale)}</TableCell>
                <TableCell align="right">
                  {item.canManage ? (
                    <Tooltip title={item.active ? t("admin.users.deleteHint") : ""}>
                      {/* A span keeps the tooltip working while the button is disabled. */}
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          disabled={item.active}
                          aria-label={t("admin.users.deleteAria", { name: item.name })}
                          onClick={() => void deleteForGood(item)}
                        >
                          <DeleteForeverIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {dialog}
    </Stack>
  );
}

function roleKey(role: string): "user" | "admin" | "owner" {
  return role === "admin" || role === "owner" ? role : "user";
}

/** The role, changed like the switches: it takes the new role once the server confirms it. */
function RoleSelect({ item, role, onError }: { item: UserAdminItem; role: AssignableRole; onError: () => void }) {
  const { t } = useI18n();
  const { shown, saving, change } = useSavedValue<AssignableRole>(
    role,
    async (next) => {
      const response = await api.admin.changeUser(item.id, { role: next });
      return response.ok ? response.data.role : null;
    },
    { onError },
  );
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
      <TextField
        select
        size="small"
        value={shown}
        disabled={saving}
        onChange={(event) => void change(event.target.value === "admin" ? "admin" : "user")}
        slotProps={{ htmlInput: { "aria-label": t("admin.users.roleAria", { name: item.name }) } }}
        sx={{ minWidth: 120 }}
      >
        <MenuItem value="user">{t("admin.users.roleName.user")}</MenuItem>
        <MenuItem value="admin">{t("admin.users.roleName.admin")}</MenuItem>
      </TextField>
      <SavingSpinner saving={saving} />
    </Box>
  );
}
