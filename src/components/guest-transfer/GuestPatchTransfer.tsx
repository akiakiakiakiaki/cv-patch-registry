"use client";

import { useEffect, useRef } from "react";
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
        const response = await fetch(`/api/synths/${encodeURIComponent(slug)}`, { cache: "no-store" });
        return response.ok ? response.json() : null;
      },
      importPatches: async (slug, patches) => {
        const response = await fetch("/api/patches/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ synthSlug: slug, patches }),
        });
        return response.ok;
      },
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
