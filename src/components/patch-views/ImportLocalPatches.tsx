"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { authClient } from "@/lib/auth/client";
import { useI18n } from "@/i18n/provider";
import type { PatchLibrary, PatchRecord } from "@/lib/domain/types";
import { LocalPatchRepository } from "@/lib/storage/local-patch-repository";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";

/** Copies this browser's patch library into the signed-in account. Hidden for anonymous visitors. */
export function ImportLocalPatches({ synthSlug }: { synthSlug: string }) {
  const { t } = useI18n();
  const { data: session } = authClient.useSession();
  const [status, setStatus] = useState<string | null>(null);
  const [patches, setPatches] = useState<readonly PatchRecord[] | null>(null);
  const repository = useMemo(() => new LocalPatchRepository(behringerProton), []);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!session) {
      setPatches(null);
      return;
    }
    const library = repository.load();
    setPatches(hasGuestExperiment(library) ? library.patches : []);
  }, [repository, session?.user.id]);

  const [pending, setPending] = useState(false);
  if (!session || !patches?.length) return null;

  async function importAll() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setStatus(t("patches.importing"));
    try {
      const response = await fetch("/api/patches/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ synthSlug, patches: patches.map(({ id, name, data }) => ({ id, name, data })) }),
      });
      if (!response.ok) {
        setStatus(t("patches.importFailed"));
        return;
      }
      repository.clear();
      setPatches([]);
      setStatus(t("patches.imported"));
    } catch {
      setStatus(t("patches.importFailed"));
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function discardLocal() {
    if (pendingRef.current || !window.confirm(t("patches.discardConfirm"))) return;
    try {
      repository.clear();
      setPatches([]);
      setStatus(null);
    } catch {
      setStatus(t("patches.discardFailed"));
    }
  }

  return (
    <>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Button size="small" variant="outlined" disabled={pending} onClick={() => void importAll()}>
          {pending ? t("patches.importing") : t("patches.importToAccount")}
        </Button>
        <Button size="small" color="inherit" disabled={pending} onClick={discardLocal}>
          {t("patches.discardLocal")}
        </Button>
      </Stack>
      {status ? <Typography variant="caption" role="status" color="text.secondary">{status}</Typography> : null}
    </>
  );
}

function hasGuestExperiment(library: PatchLibrary): boolean {
  if (library.patches.length > 1) return true;
  return library.patches.some((patch) => {
    const name = patch.name.trim().toLocaleLowerCase();
    const hasData = Object.keys(patch.data.knobs).length > 0
      || Object.keys(patch.data.switches).length > 0
      || Object.keys(patch.data.leds).length > 0
      || patch.data.cables.length > 0;
    return hasData || (name !== "new patch" && name !== "neues patch");
  });
}
