"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { authClient } from "@/lib/auth/client";
import { useI18n } from "@/i18n/provider";
import type { PatchRecord } from "@/lib/domain/types";

/** Copies this browser's patch library into the signed-in account. Hidden for anonymous visitors. */
export function ImportLocalPatches({ synthSlug, patches }: { synthSlug: string; patches: readonly PatchRecord[] }) {
  const { t } = useI18n();
  const { data: session } = authClient.useSession();
  const [status, setStatus] = useState<string | null>(null);
  if (!session) return null;

  async function importAll() {
    setStatus(t("patches.importing"));
    const response = await fetch("/api/patches/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ synthSlug, patches: patches.map((patch) => ({ name: patch.name, data: patch.data })) }),
    });
    setStatus(response.ok ? t("patches.imported") : t("patches.importFailed"));
  }

  return (
    <>
      <Button size="small" variant="outlined" onClick={() => void importAll()}>
        {t("patches.importToAccount")}
      </Button>
      {status ? <Typography variant="caption" role="status" color="text.secondary">{status}</Typography> : null}
    </>
  );
}
