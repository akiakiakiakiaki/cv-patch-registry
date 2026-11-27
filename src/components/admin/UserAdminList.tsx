"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { SavingSpinner } from "@/components/admin/SavingSpinner";
import { SavingSwitch } from "@/components/admin/SavingSwitch";
import { useSavedValue } from "@/components/admin/use-saved-value";
import { api } from "@/lib/api/client";
import type { UserAdminItem } from "@/lib/users/user-admin";
import { formatTimestamp } from "@/lib/utils/date-format";
import { useI18n } from "@/i18n/provider";

type AssignableRole = "user" | "admin";

/**
 * Every account with its role, email confirmation and active switch. What the viewing admin may change is decided
 * by the server (canManage, canChangeRole); the owner and the admin's own account are shown read-only.
 */
export function UserAdminList({ items }: { items: readonly UserAdminItem[] }) {
  const { locale, t } = useI18n();
  const [failed, setFailed] = useState<string | null>(null);
  const fail = (name: string) => setFailed(t("admin.users.saveFailed", { name }));

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
      {failed ? (
        <Alert severity="error" onClose={() => setFailed(null)}>
          {failed}
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
                    onError={() => fail(item.name)}
                  />
                </TableCell>
                <TableCell>{formatTimestamp(item.createdAt, locale)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
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
