"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { AppDialog } from "@/components/app-dialog/AppDialog";
import { api } from "@/lib/api/client";
import { useI18n } from "@/i18n/provider";
import { panelRejectionMessage, uploadPanelFile } from "@/components/synth-editor/upload-panel";

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
      return setError(panelRejectionMessage(upload.reason, t));
    }
    const response = await api.synths.create({ displayName, slug, manufacturer, panelAssetId: upload.panel.assetId, controls: [] });
    setBusy(false);
    if (response.ok) {
      reset();
      onCreated(response.data.slug);
      return;
    }
    setError(response.error === "slug-taken" ? t("synths.slugTaken") : t("synths.invalid"));
  }

  return (
    <AppDialog
      open={open}
      onClose={close}
      title={t("synths.createTitle")}
      onSubmit={(event) => void submit(event)}
      actions={
        <>
          <Button onClick={close} disabled={busy}>{t("synths.cancel")}</Button>
          <Button type="submit" variant="contained" disabled={busy || !file || !displayName || !slug}>
            {busy ? t("synths.saving") : t("synths.create")}
          </Button>
        </>
      }
    >
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
    </AppDialog>
  );
}
