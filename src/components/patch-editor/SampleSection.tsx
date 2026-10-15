"use client";

import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useI18n } from "@/i18n/provider";

const MAX_SECONDS = 30;

/** Browser-side duration check. The server checks size and format, not duration (known gap). */
async function durationOf(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = url;
    await new Promise<void>((resolve) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () => resolve();
    });
    return Number.isFinite(audio.duration) ? audio.duration : 0;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface SampleInfo {
  url: string;
  title: string;
  license: string;
}

export function SampleSection({ patchId, sample, isOwner }: { patchId: string; sample: SampleInfo | null; isOwner: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const enabled = process.env.NEXT_PUBLIC_FEATURE_AUDIO === "true";
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [license, setLicense] = useState("");
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ severity: "success" | "error"; text: string } | null>(null);

  if (!enabled) return null;

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setMessage(null);
    if ((await durationOf(file)) > MAX_SECONDS) {
      setBusy(false);
      setMessage({ severity: "error", text: t("sample.tooLong") });
      return;
    }
    const query = new URLSearchParams({ title, license, rights: String(rights) });
    const response = await fetch(`/api/patches/${encodeURIComponent(patchId)}/sample?${query.toString()}`, {
      method: "POST",
      body: file,
    });
    setBusy(false);
    if (response.ok) {
      setMessage({ severity: "success", text: t("sample.uploaded") });
      router.refresh();
      return;
    }
    const errors: Record<number, string> = {
      409: t("sample.exists"),
      413: t("sample.tooLarge"),
      422: t("sample.invalid"),
    };
    setMessage({ severity: "error", text: errors[response.status] ?? t("sample.invalid") });
  }

  return (
    <Stack spacing={2} sx={{ mt: 3 }} component="section" aria-labelledby="sample-heading">
      <Typography id="sample-heading" variant="subtitle1" component="h2">{t("sample.title")}</Typography>
      {sample ? (
        <Box>
          <audio controls preload="none" src={sample.url} aria-label={sample.title} style={{ width: "100%", maxWidth: 480 }} />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {sample.title} · {t("sample.license")}: {sample.license}
          </Typography>
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">{t("sample.none")}</Typography>
      )}

      {isOwner && !sample ? (
        <Box component="form" onSubmit={upload} noValidate sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, maxWidth: 720 }}>
          <TextField
            type="file"
            label={t("sample.file")}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { accept: "audio/mpeg,.mp3" } }}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)}
            required
          />
          <TextField label={t("sample.sampleTitle")} value={title} onChange={(event) => setTitle(event.target.value)} required />
          <TextField label={t("sample.license")} value={license} onChange={(event) => setLicense(event.target.value)} required />
          <FormControlLabel
            control={<Checkbox checked={rights} onChange={(event) => setRights(event.target.checked)} />}
            label={t("sample.rights")}
          />
          <Box>
            <Button type="submit" variant="outlined" disabled={busy || !file || !rights || !title || !license}>
              {busy ? t("sample.uploading") : t("sample.submit")}
            </Button>
          </Box>
        </Box>
      ) : null}

      {message ? <Alert severity={message.severity} role={message.severity === "error" ? "alert" : "status"}>{message.text}</Alert> : null}
    </Stack>
  );
}
