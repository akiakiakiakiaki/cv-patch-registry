"use client";

import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
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
import { VISUALLY_HIDDEN } from "@/components/app-shell/layout";
import AudioFileIcon from "@mui/icons-material/AudioFileOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import NextLink from "next/link";
import type { SampleAdminItem, SampleGroup } from "@/lib/samples/sample-admin";
import { formatTimestamp } from "@/lib/utils/date-format";
import { useI18n } from "@/i18n/provider";
import { PersonCell } from "@/components/admin/PersonCell";
import { personName } from "@/lib/users/person";
import { synthName } from "@/lib/synths/synth-name";

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Every sample file, grouped by synth in collapsible sections. Files no patch uses come first, marked: they can
 * potentially be removed.
 */
export function SampleAdminList({ groups }: { groups: readonly SampleGroup[] }) {
  const { t } = useI18n();
  const unused = groups.find((group) => group.synth === null)?.samples.length ?? 0;
  return (
    <Stack spacing={2}>
      <div>
        <Typography variant="h5" component="h2">
          {t("admin.samples.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("admin.samples.intro")}
        </Typography>
      </div>
      <Typography role="status" variant="body2">
        {unused === 0 ? t("admin.samples.noneUnused") : t("admin.samples.unusedCount", { count: unused })}
      </Typography>
      {groups.length === 0 ? <Typography color="text.secondary">{t("admin.samples.empty")}</Typography> : null}
      <div>
        {groups.map((group) => (
          <Accordion key={group.synth?.slug ?? "unused"} disableGutters variant="outlined" defaultExpanded={group.synth === null}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                {group.synth ? null : <LinkOffIcon color="warning" fontSize="small" aria-hidden />}
                <Typography>
                  {group.synth ? synthName(t, group.synth) : t("admin.samples.unusedGroup")} ({group.samples.length})
                </Typography>
                {group.synth?.deleted ? <Chip size="small" color="error" label={t("admin.synths.statusDeleted")} /> : null}
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <SampleTable samples={group.samples} synthSlug={group.synth?.slug ?? null} />
            </AccordionDetails>
          </Accordion>
        ))}
      </div>
    </Stack>
  );
}

function SampleTable({ samples, synthSlug }: { samples: readonly SampleAdminItem[]; synthSlug: string | null }) {
  const { locale, t } = useI18n();
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox">
              {/* The column shows an icon only; screen readers still get its name. */}
              <Box component="span" sx={VISUALLY_HIDDEN}>
                {t("admin.samples.usage")}
              </Box>
            </TableCell>
            <TableCell>{t("admin.samples.sample")}</TableCell>
            <TableCell>{t("admin.samples.patch")}</TableCell>
            <TableCell>{t("admin.samples.uploader")}</TableCell>
            <TableCell align="right">{t("admin.samples.size")}</TableCell>
            <TableCell>{t("admin.samples.uploaded")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {samples.map((item) => {
            const used = item.patch !== null;
            const label = item.sample?.title ?? t("admin.samples.untitled");
            return (
              <TableRow key={item.assetId} data-sample={item.assetId} data-used={used}>
                <TableCell padding="checkbox">
                  {used ? (
                    <AudioFileIcon fontSize="small" color="action" aria-label={t("admin.samples.usedAria")} />
                  ) : (
                    <Tooltip title={t("admin.samples.unusedHint")}>
                      <LinkOffIcon fontSize="small" color="warning" aria-label={t("admin.samples.unusedHint")} />
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell>
                  {label}
                  {item.sample ? (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                      {t("sample.license")}: {item.sample.license}
                    </Typography>
                  ) : null}
                  <audio controls preload="none" src={item.url} aria-label={label} style={{ display: "block", height: 32, maxWidth: 260 }} />
                </TableCell>
                <TableCell>
                  {item.patch && synthSlug ? (
                    <>
                      <Link component={NextLink} href={`/?synth=${encodeURIComponent(synthSlug)}&patch=${encodeURIComponent(item.patch.id)}`}>
                        {item.patch.name}
                      </Link>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        {personName(t, item.patch.owner)} · {item.patch.visibility === "public" ? t("admin.samples.public") : t("admin.samples.private")}
                      </Typography>
                    </>
                  ) : (
                    <Typography variant="body2" color="warning.main">
                      {t("admin.samples.noPatch")}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <PersonCell person={item.uploader} />
                </TableCell>
                <TableCell align="right">{megabytes(item.byteSize)}</TableCell>
                <TableCell>{formatTimestamp(item.createdAt, locale)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
