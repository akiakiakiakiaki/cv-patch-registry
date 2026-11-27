"use client";

import { useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import DownloadIcon from "@mui/icons-material/Download";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useConfirmDialog } from "@/components/confirm-dialog/ConfirmDialog";
import { BackupError, createBackupFile, readBackupFile, restoreBackup, type BackupProgress } from "@/components/admin/backup-client";
import { backupFileName, BACKUP_TABLES, type Backup } from "@/lib/backup/backup-format";
import { formatTimestamp } from "@/lib/utils/date-format";
import { downloadFile } from "@/lib/utils/download";
import { useI18n } from "@/i18n/provider";

type Message = { severity: "success" | "error" | "info" | "warning"; text: string };

/**
 * Import/Export: downloads a complete backup (data and files) to this computer, and restores one. Restoring first
 * downloads a backup of the current state, so a wrong file can be undone.
 */
export function BackupAdminPanel() {
  const { locale, t } = useI18n();
  const { confirm, dialog } = useConfirmDialog();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [chosen, setChosen] = useState<Backup | null>(null);

  const progressText = (value: BackupProgress) =>
    value.step === "files" ? t("admin.backup.progressFiles", { done: value.done, total: value.total }) : t(`admin.backup.progress.${value.step}`);

  const errorText = (error: unknown) =>
    error instanceof BackupError ? t(`admin.backup.error.${error.problem}`, { detail: error.detail ?? "" }) : t("admin.backup.error.restore-failed");

  /** Downloads a backup; resolves the files storage did not have (they are not in the backup). */
  async function downloadBackup(): Promise<string[]> {
    const file = await createBackupFile(setProgress);
    downloadFile(backupFileName(file.createdAt), file.bytes as BlobPart, "application/zip");
    return file.missingFiles;
  }

  async function exportNow() {
    setBusy(true);
    setMessage(null);
    try {
      const missing = await downloadBackup();
      setMessage(
        missing.length
          ? { severity: "warning", text: t("admin.backup.exportedMissing", { count: missing.length, files: missing.join(", ") }) }
          : { severity: "success", text: t("admin.backup.exported") },
      );
    } catch (error) {
      setMessage({ severity: "error", text: errorText(error) });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function choose(file: File | undefined) {
    setChosen(null);
    setMessage(null);
    if (!file) return;
    try {
      setChosen(await readBackupFile(file));
    } catch {
      setMessage({ severity: "error", text: t("admin.backup.notABackup") });
    }
  }

  async function restoreNow(backup: Backup) {
    const confirmed = await confirm({
      tone: "danger",
      title: t("admin.backup.restoreTitle"),
      content: t("admin.backup.restoreText"),
      confirmLabel: t("admin.backup.restoreConfirm"),
    });
    if (!confirmed) return;
    setBusy(true);
    setMessage(null);
    try {
      // A backup of the current state first, so a wrong file can be undone.
      await downloadBackup();
      await restoreBackup(backup, setProgress);
      setChosen(null);
      setMessage({ severity: "success", text: t("admin.backup.restored") });
      // Every session ended with the restore: continue at the sign-in.
      window.setTimeout(() => window.location.assign("/login"), 4000);
    } catch (error) {
      setMessage({ severity: "error", text: errorText(error) });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Stack spacing={2}>
      <div>
        <Typography variant="h5" component="h2">
          {t("admin.backup.title")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("admin.backup.intro")}
        </Typography>
      </div>
      {message ? <Alert severity={message.severity}>{message.text}</Alert> : null}
      {progress ? (
        <Typography role="status" variant="body2">
          {progressText(progress)}
        </Typography>
      ) : null}

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
            <Typography variant="subtitle1" component="h3">
              {t("admin.backup.exportTitle")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("admin.backup.exportText")}
            </Typography>
            <Button variant="contained" startIcon={<DownloadIcon />} disabled={busy} onClick={() => void exportNow()}>
              {t("admin.backup.export")}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
            <Typography variant="subtitle1" component="h3">
              {t("admin.backup.importTitle")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("admin.backup.importText")}
            </Typography>
            <Button variant="outlined" startIcon={<UploadFileIcon />} disabled={busy} onClick={() => fileInput.current?.click()}>
              {t("admin.backup.choose")}
            </Button>
            <input
              ref={fileInput}
              hidden
              type="file"
              accept=".zip,application/zip"
              aria-label={t("admin.backup.choose")}
              onChange={(event) => {
                void choose(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            {chosen ? (
              <Stack spacing={1} data-testid="backup-summary">
                <Typography variant="body2">
                  {t("admin.backup.summary", {
                    date: formatTimestamp(chosen.manifest.createdAt, locale),
                    files: chosen.manifest.files.length,
                    migrations: chosen.manifest.migrations,
                  })}
                </Typography>
                {chosen.manifest.missingFiles?.length ? (
                  <Typography variant="caption" color="warning.main">
                    {t("admin.backup.summaryMissing", { count: chosen.manifest.missingFiles.length })}
                  </Typography>
                ) : null}
                <Typography variant="caption" color="text.secondary">
                  {BACKUP_TABLES.map((table) => `${table}: ${chosen.manifest.rows[table] ?? 0}`).join(" · ")}
                </Typography>
                <Button color="error" variant="contained" disabled={busy} onClick={() => void restoreNow(chosen)} sx={{ alignSelf: "flex-start" }}>
                  {t("admin.backup.restore")}
                </Button>
              </Stack>
            ) : null}
          </Stack>
        </CardContent>
      </Card>
      {dialog}
    </Stack>
  );
}
