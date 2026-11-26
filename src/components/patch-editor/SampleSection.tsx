"use client";

import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { api, type StoredSample } from "@/lib/api/client";
import { useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/messages";

const MAX_SECONDS = 30;

/** Error codes of POST /api/patches/:id/sample, mapped to their messages. */
const UPLOAD_ERRORS: Readonly<Record<string, MessageKey>> = {
  disabled: "sample.disabled",
  "not-found": "sample.notFound",
  unauthorized: "sample.unauthorized",
  "sample-exists": "sample.exists",
  invalid: "sample.invalidMeta",
  "unsupported-type": "sample.unsupportedType",
  "too-large": "sample.tooLarge",
  quota: "sample.quota",
};

/** Reads the duration in the browser before uploading. */
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

export type SampleInfo = StoredSample;

/**
 * Plays a patch's sample. The owner can upload one, or replace the existing one (rights are confirmed again).
 * `onChange` receives the stored sample so the caller can show it without reloading.
 */
export function SampleSection({
  patchId,
  sample,
  isOwner,
  onChange,
}: {
  patchId: string;
  sample: SampleInfo | null;
  isOwner: boolean;
  onChange?: (sample: SampleInfo) => void;
}) {
  const { t } = useI18n();
  const enabled = process.env.NEXT_PUBLIC_FEATURE_AUDIO === "true";
  const [replacing, setReplacing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [license, setLicense] = useState("");
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ severity: "success" | "error"; text: string } | null>(null);

  if (!enabled) return null;

  const replace = sample !== null;

  function startReplacing(current: SampleInfo) {
    setTitle(current.title);
    setLicense(current.license);
    setRights(false);
    setFile(null);
    setMessage(null);
    setReplacing(true);
  }

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
    const response = await api.patches.uploadSample(patchId, file, { title, license, rights: String(rights), ...(replace ? { replace: "true" } : {}) });
    setBusy(false);
    if (response.ok) {
      const stored = response.data;
      setMessage({ severity: "success", text: t(replace ? "sample.replaced" : "sample.uploaded") });
      setReplacing(false);
      setFile(null);
      setRights(false);
      if (stored.sample) onChange?.(stored.sample);
      return;
    }
    const key = response.error ? UPLOAD_ERRORS[response.error] : undefined;
    setMessage({ severity: "error", text: t(key ?? "sample.failed") });
  }

  return (
    <Stack spacing={2} sx={{ mt: 3 }} component="section" aria-labelledby="sample-heading">
      <Typography id="sample-heading" variant="subtitle1" component="h2">{t("sample.title")}</Typography>
      {sample ? (
        <Box>
          <audio key={sample.url} controls preload="none" src={sample.url} aria-label={sample.title} style={{ width: "100%", maxWidth: 480 }} />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {sample.title} · {t("sample.license")}: {sample.license}
          </Typography>
          {isOwner && !replacing ? (
            <Button size="small" sx={{ mt: 1 }} onClick={() => startReplacing(sample)}>
              {t("sample.replace")}
            </Button>
          ) : null}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">{t("sample.none")}</Typography>
      )}

      {isOwner && (!sample || replacing) ? (
        <Box component="form" onSubmit={upload} noValidate sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, maxWidth: 720 }}>
          <TextField
            type="file"
            label={t("sample.file")}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { accept: "audio/mpeg,.mp3,audio/mp4,audio/x-m4a,.m4a" } }}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)}
            required
          />
          <TextField label={t("sample.sampleTitle")} value={title} onChange={(event) => setTitle(event.target.value)} required />
          <TextField label={t("sample.license")} value={license} onChange={(event) => setLicense(event.target.value)} required />
          <FormControlLabel
            control={<Checkbox checked={rights} onChange={(event) => setRights(event.target.checked)} />}
            label={t("sample.rights")}
          />
          <Stack direction="row" spacing={1}>
            <Button type="submit" variant="outlined" disabled={busy || !file || !rights || !title || !license}>
              {busy ? t("sample.uploading") : t(replace ? "sample.replaceSubmit" : "sample.submit")}
            </Button>
            {replacing ? (
              <Button onClick={() => setReplacing(false)} disabled={busy}>
                {t("confirm.cancel")}
              </Button>
            ) : null}
          </Stack>
        </Box>
      ) : null}

      {message ? <Alert severity={message.severity} role={message.severity === "error" ? "alert" : "status"}>{message.text}</Alert> : null}
    </Stack>
  );
}
