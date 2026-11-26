"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccountPatchLibrary,
  type AccountPatchLibraryOptions,
  type AccountSaveStatus,
} from "@/hooks/use-account-patch-library";
import type { PatchLibrary, PatchRecord } from "@/lib/domain/types";
import type { InstrumentDefinition } from "@/lib/instruments/types";
import { loadLocalLibrary } from "@/lib/storage/legacy-proton-local";
import { LocalPatchRepository } from "@/lib/storage/local-patch-repository";
import { useI18n } from "@/i18n/provider";

type Translate = ReturnType<typeof useI18n>["t"];

/**
 * The patch library the sheet works on: on the server for signed-in users (`accountMode`), in this browser otherwise.
 * `commit` saves a changed library either way; `status` describes the last save.
 */
export function useSheetLibrary(
  synthSlug: string,
  instrument: InstrumentDefinition | null,
  accountMode: boolean,
  options: AccountPatchLibraryOptions,
) {
  const { t } = useI18n();
  const [localLibrary, setLocalLibrary] = useState<PatchLibrary | null>(null);
  const [localStatus, setLocalStatus] = useState(t("status.saved"));
  const repository = useMemo(() => (instrument ? new LocalPatchRepository(instrument) : null), [instrument]);
  useEffect(() => {
    if (repository && instrument) setLocalLibrary(loadLocalLibrary(repository, instrument.id, t("patch.new")));
  }, [repository, instrument, t]);

  const account = useAccountPatchLibrary(synthSlug, accountMode && instrument !== null, options);
  const library: PatchLibrary | null = accountMode ? account.library : localLibrary;
  const status = accountMode ? accountStatusText(account.status, t) : localStatus;
  const activePatch: PatchRecord | undefined = library?.patches.find((patch) => patch.id === library.activeId) ?? library?.patches[0];

  const commit = useCallback(
    (next: PatchLibrary, message = t("status.saved")) => {
      if (accountMode) {
        account.commit(next);
        return;
      }
      repository?.save(next);
      setLocalLibrary(next);
      setLocalStatus(message);
    },
    [accountMode, account, repository, t],
  );

  /** Forgets the browser library shown, e.g. before another synth's library is loaded. */
  const clearLocal = useCallback(() => setLocalLibrary(null), []);

  return { library, activePatch, status, setStatus: setLocalStatus, commit, clearLocal, account };
}

function accountStatusText(status: AccountSaveStatus, t: Translate): string {
  if (status === "saving") return t("status.saving");
  if (status === "conflict") return t("status.conflictReload");
  if (status === "error") return t("status.saveError");
  // Signed-in users' patches live on the server only; "status.saved" is the browser-storage message for guests.
  return t("status.savedAccount");
}
