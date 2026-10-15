"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useI18n } from "@/i18n/provider";
import { uploadPanelFile } from "@/components/synth-editor/upload-panel";

/** Lowercase URL identifier derived from a display name. */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** Creates a synth with its panel. Controls are added afterwards in the layout editor. */
export function NewSynthDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (slug: string) => void }) {
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDisplayName("");
    setManufacturer("");
    setSlug("");
    setSlugEdited(false);
    setFile(null);
    setError(null);
  }

  function close() {
    if (!busy) {
      reset();
      onClose();
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    const upload = await uploadPanelFile(file);
    if (!upload.ok) {
      setBusy(false);
      return setError(t("synths.panelRejected", { reason: upload.reason }));
    }
    const response = await fetch("/api/synths", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName, slug, manufacturer, panelAssetId: upload.panel.assetId, controls: [] }),
    });
    setBusy(false);
    if (response.ok) {
      const created = (await response.json()) as { slug: string };
      reset();
      onCreated(created.slug);
      return;
    }
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setError(body.error === "slug-taken" ? t("synths.slugTaken") : t("synths.invalid"));
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby="new-synth-title">
      <Box component="form" onSubmit={submit}>
      <DialogTitle id="new-synth-title">{t("synths.createTitle")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label={t("synths.displayName")}
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
              if (!slugEdited) setSlug(slugify(event.target.value));
            }}
            required
            autoFocus
          />
          <TextField label={t("synths.manufacturer")} value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} />
          <TextField
            label={t("synths.slug")}
            value={slug}
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(event.target.value.toLowerCase());
            }}
            helperText={t("synths.slugHelp")}
            required
          />
          <Box>
            <Typography variant="body2" component="label" htmlFor="new-synth-panel" sx={{ display: "block", mb: 1 }}>
              {t("synths.panelUpload")}
            </Typography>
            <input id="new-synth-panel" type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{t("synths.panelHint")}</Typography>
          </Box>
          {error ? <Alert severity="error" role="alert">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={busy}>{t("synths.cancel")}</Button>
        <Button type="submit" variant="contained" disabled={busy || !file || !displayName || !slug}>
          {busy ? t("synths.saving") : t("synths.create")}
        </Button>
      </DialogActions>
      </Box>
    </Dialog>
  );
}
