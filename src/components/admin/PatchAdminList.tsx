"use client";

import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Chip from "@mui/material/Chip";
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
import AudioFileIcon from "@mui/icons-material/AudioFileOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import NextLink from "next/link";
import type { PatchAdminItem, PatchGroup } from "@/lib/patches/patch-admin";
import { synthName } from "@/lib/synths/synth-name";
import { formatTimestamp } from "@/lib/utils/date-format";
import { useI18n } from "@/i18n/provider";

/** Every patch, private ones included, grouped by synth in collapsible sections. Read-only for now. */
export function PatchAdminList({ groups }: { groups: readonly PatchGroup[] }) {
  const { t } = useI18n();
  const total = groups.reduce((sum, group) => sum + group.patches.length, 0);
  return (
    <Stack spacing={2}>
      <div>
        <Typography variant="h5" component="h2">
          {t("admin.patches.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("admin.patches.intro")}
        </Typography>
      </div>
      <Typography role="status" variant="body2">
        {t("admin.patches.count", { count: total, synths: groups.length })}
      </Typography>
      <div>
        {groups.map((group) => (
          <Accordion key={group.synth.slug} disableGutters variant="outlined">
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Typography>
                  {synthName(t, group.synth)} ({group.patches.length})
                </Typography>
                {group.synth.deleted ? <Chip size="small" color="error" label={t("admin.synths.statusDeleted")} /> : null}
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <PatchTable group={group} />
            </AccordionDetails>
          </Accordion>
        ))}
      </div>
    </Stack>
  );
}

function PatchTable({ group }: { group: PatchGroup }) {
  const { locale, t } = useI18n();
  const current = group.synth.currentRevision;
  const outdated = (item: PatchAdminItem) => current !== null && item.synthRevision < current;
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{t("admin.patches.patch")}</TableCell>
            <TableCell>{t("admin.patches.owner")}</TableCell>
            <TableCell>{t("admin.patches.visibility")}</TableCell>
            <TableCell>{t("admin.patches.saved")}</TableCell>
            <TableCell align="right">{t("admin.patches.revision")}</TableCell>
            <TableCell align="right">{t("admin.patches.synthRevision")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {group.patches.map((item) => (
            <TableRow key={item.id} data-patch={item.id}>
              <TableCell>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                  <Link component={NextLink} href={`/?synth=${encodeURIComponent(group.synth.slug)}&patch=${encodeURIComponent(item.id)}`}>
                    {item.name}
                  </Link>
                  {item.hasSample ? <AudioFileIcon fontSize="small" color="action" aria-label={t("admin.patches.hasSample")} /> : null}
                </Stack>
                {item.tagLabels.length ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    {item.tagLabels.join(", ")}
                  </Typography>
                ) : null}
              </TableCell>
              <TableCell>
                {item.owner.name}
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  {item.owner.email}
                </Typography>
              </TableCell>
              <TableCell>{item.visibility === "public" ? t("admin.samples.public") : t("admin.samples.private")}</TableCell>
              <TableCell>
                {formatTimestamp(item.updatedAt, locale)}
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  {t("admin.patches.created", { date: formatTimestamp(item.createdAt, locale) })}
                </Typography>
              </TableCell>
              <TableCell align="right">{item.revision}</TableCell>
              <TableCell align="right">
                {outdated(item) ? (
                  <Tooltip title={t("admin.patches.outdatedHint", { current: current ?? "" })}>
                    <Chip size="small" color="warning" variant="outlined" label={t("admin.patches.outdated", { revision: item.synthRevision, current: current ?? "" })} />
                  </Tooltip>
                ) : (
                  item.synthRevision
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
