"use client";

import { useState } from "react";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import LayersClearIcon from "@mui/icons-material/LayersClear";
import NextLink from "next/link";
import { SavingSwitch } from "@/components/admin/SavingSwitch";
import { useConfirmDialog } from "@/components/confirm-dialog/ConfirmDialog";
import { api } from "@/lib/api/client";
import { KEPT_RECENT_REVISIONS } from "@/lib/domain/synth-revisions";
import type { SynthAdminItem } from "@/lib/synths/synth-admin";
import { formatTimestamp } from "@/lib/utils/date-format";
import { useI18n } from "@/i18n/provider";
import { synthName } from "@/lib/synths/synth-name";

type Message = { severity: "success" | "error"; text: string };

/**
 * Every synth with its approval and active switch and the clean-up actions: reduce old revisions, and remove a
 * deleted synth for good. Waiting synths first, deleted ones last; the order stays while working, so rows do not
 * jump under the pointer.
 */
export function SynthAdminList({ items: initialItems }: { items: readonly SynthAdminItem[] }) {
  const { locale, t } = useI18n();
  const { confirm, dialog } = useConfirmDialog();
  const [items, setItems] = useState(() =>
    [...initialItems].sort((left, right) => Number(left.deleted) - Number(right.deleted) || Number(left.approved) - Number(right.approved)),
  );
  const [message, setMessage] = useState<Message | null>(null);
  const waiting = items.filter((item) => item.owner && !item.deleted && !item.approved).length;

  const update = (slug: string, change: Partial<SynthAdminItem>) =>
    setItems((current) => current.map((item) => (item.slug === slug ? { ...item, ...change } : item)));
  const fail = (key: "admin.synths.saveFailed" | "admin.synths.actionFailed", name: string) => setMessage({ severity: "error", text: t(key, { name }) });

  async function reduce(item: SynthAdminItem) {
    const confirmed = await confirm({
      tone: "warning",
      title: t("admin.synths.reduceTitle"),
      content: t("admin.synths.reduceText", { name: synthName(t, item), count: item.removableRevisions, keep: KEPT_RECENT_REVISIONS }),
      confirmLabel: t("admin.synths.reduce"),
    });
    if (!confirmed) return;
    const response = await api.admin.reduceRevisions(item.slug);
    if (!response.ok) return fail("admin.synths.actionFailed", synthName(t, item));
    update(item.slug, { removableRevisions: 0, storedRevisions: item.storedRevisions - response.data.removed });
    setMessage({ severity: "success", text: t("admin.synths.reduced", { name: synthName(t, item), count: response.data.removed }) });
  }

  async function purge(item: SynthAdminItem) {
    const confirmed = await confirm({
      tone: "danger",
      title: t("admin.synths.purgeTitle"),
      content: t("admin.synths.purgeText", { name: synthName(t, item), patches: item.patchCount, users: item.patchOwnerCount }),
      confirmLabel: t("admin.synths.purge"),
    });
    if (!confirmed) return;
    const response = await api.admin.purgeSynth(item.slug);
    if (!response.ok) return fail("admin.synths.actionFailed", synthName(t, item));
    setItems((current) => current.filter((candidate) => candidate.slug !== item.slug));
    setMessage({ severity: "success", text: t("admin.synths.purged", { name: synthName(t, item) }) });
  }

  return (
    <Stack spacing={2}>
      <div>
        <Typography variant="h5" component="h2">
          {t("admin.synths.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("admin.synths.intro")}
        </Typography>
      </div>
      <Typography role="status" variant="body2">
        {waiting === 0 ? t("admin.synths.noneWaiting") : t("admin.synths.waiting", { count: waiting })}
      </Typography>
      {message ? (
        <Alert severity={message.severity} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      ) : null}
      <TableContainer>
        <Table size="small" aria-label={t("admin.synths.title")}>
          <TableHead>
            <TableRow>
              <TableCell>{t("admin.synths.synth")}</TableCell>
              <TableCell>{t("admin.synths.owner")}</TableCell>
              <TableCell>{t("admin.synths.created")}</TableCell>
              <TableCell align="right">{t("admin.synths.revision")}</TableCell>
              <TableCell align="right">{t("admin.synths.patches")}</TableCell>
              <TableCell>{t("admin.synths.status")}</TableCell>
              <TableCell>{t("admin.synths.approved")}</TableCell>
              <TableCell>{t("admin.synths.active")}</TableCell>
              <TableCell align="right">{t("admin.synths.actions")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => {
              const builtIn = !item.owner;
              return (
                <TableRow key={item.slug} data-synth={item.slug} sx={item.deleted ? { "& > td": { color: "text.disabled" } } : undefined}>
                  <TableCell>
                    {item.deleted ? (
                      <span style={{ textDecoration: "line-through" }}>{synthName(t, item)}</span>
                    ) : (
                      <Link component={NextLink} href={`/?synth=${encodeURIComponent(item.slug)}`}>
                        {synthName(t, item)}
                      </Link>
                    )}
                    {item.manufacturer ? (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        {item.manufacturer}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {item.owner ? (
                      <>
                        {item.owner.name}
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          {item.owner.email}
                        </Typography>
                      </>
                    ) : (
                      t("admin.synths.builtIn")
                    )}
                  </TableCell>
                  <TableCell>{formatTimestamp(item.createdAt, locale)}</TableCell>
                  <TableCell align="right">
                    {item.revision ?? "–"}
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", whiteSpace: "nowrap" }}>
                      {t("admin.synths.storedRevisions", { count: item.storedRevisions })}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {item.patchCount}
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                      {t("admin.synths.patchUsers", { count: item.patchOwnerCount })}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {item.deleted ? (
                      <Chip size="small" color="error" label={t("admin.synths.statusDeleted")} />
                    ) : (
                      <Chip
                        size="small"
                        color={item.approved ? "success" : "warning"}
                        variant={item.approved ? "outlined" : "filled"}
                        label={item.approved ? t("admin.synths.statusApproved") : t("admin.synths.statusWaiting")}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {/* Built-in synths come with the app and are always approved. */}
                    <SavingSwitch
                      checked={item.approved}
                      disabled={builtIn}
                      ariaLabel={t("admin.synths.approveAria", { name: synthName(t, item) })}
                      save={async (next) => {
                        const response = await api.admin.setSynthApproval(item.slug, next);
                        return response.ok ? response.data.approved : null;
                      }}
                      onSaved={(approved) => {
                        setMessage(null);
                        update(item.slug, { approved });
                      }}
                      onError={() => fail("admin.synths.saveFailed", synthName(t, item))}
                    />
                  </TableCell>
                  <TableCell>
                    <SavingSwitch
                      tone="status"
                      checked={!item.deleted}
                      disabled={builtIn}
                      ariaLabel={t("admin.synths.activeAria", { name: synthName(t, item) })}
                      save={async (active) => {
                        const response = await api.admin.setSynthDeleted(item.slug, !active);
                        return response.ok ? !response.data.deleted : null;
                      }}
                      onSaved={(active) => {
                        setMessage(null);
                        update(item.slug, { deleted: !active });
                      }}
                      onError={() => fail("admin.synths.saveFailed", synthName(t, item))}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    <Tooltip title={t("admin.synths.reduceHint", { count: item.removableRevisions, keep: KEPT_RECENT_REVISIONS })}>
                      {/* A span keeps the tooltip working while the button is disabled. */}
                      <span>
                        <IconButton
                          size="small"
                          aria-label={t("admin.synths.reduceAria", { name: synthName(t, item) })}
                          disabled={builtIn || item.removableRevisions === 0}
                          onClick={() => void reduce(item)}
                        >
                          <LayersClearIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    {item.deleted ? (
                      <IconButton size="small" color="error" aria-label={t("admin.synths.purgeAria", { name: synthName(t, item) })} onClick={() => void purge(item)}>
                        <DeleteForeverIcon fontSize="small" />
                      </IconButton>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {dialog}
    </Stack>
  );
}
