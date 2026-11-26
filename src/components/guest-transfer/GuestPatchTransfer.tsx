"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api/client";
import { authClient } from "@/lib/auth/client";
import { clearGuestTransferPending, guestTransferPendingFor, transferGuestPatches } from "@/lib/storage/guest-transfer";

/** Dispatched on window after guest patches were copied into the account, so open libraries reload. */
export const PATCHES_IMPORTED_EVENT = "patch-sheet:patches-imported";

/**
 * Runs the one-time move of guest patches into a new account (see guest-transfer) on the first sign-in after
 * registering in this browser. Renders nothing. A failed synth is retried on the next page load.
 */
export function GuestPatchTransfer() {
  const { data: session } = authClient.useSession();
  const email = session?.user?.email;
  const running = useRef(false);

  useEffect(() => {
    if (!email || running.current || !guestTransferPendingFor(email)) return;
    running.current = true;
    void transferGuestPatches({
      loadSynth: async (slug) => {
        const response = await api.synths.get(slug);
        return response.ok ? response.data : null;
      },
      importPatches: async (slug, patches) => (await api.patches.import(slug, patches)).ok,
    })
      .then((result) => {
        if (result.failed.length === 0) clearGuestTransferPending();
        if (result.transferred.length > 0) window.dispatchEvent(new Event(PATCHES_IMPORTED_EVENT));
      })
      .catch(() => undefined)
      .finally(() => {
        running.current = false;
      });
  }, [email]);

  return null;
}
