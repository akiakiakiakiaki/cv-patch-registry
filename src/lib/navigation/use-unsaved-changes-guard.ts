"use client";

import { useEffect, useRef } from "react";
import { setLeaveGuard } from "@/lib/navigation/leave-guard";
import { useConfirmLinkNavigation } from "@/lib/navigation/use-confirm-link-navigation";

/**
 * Every way out of a view with unsaved changes asks first: leaving from elsewhere in the app (e.g. signing out)
 * and in-app links call `confirmLeave`; closing or reloading the tab gets the browser's warning.
 * `active`: the view is open; `dirty`: it has unsaved changes.
 */
export function useUnsavedChangesGuard(active: boolean, dirty: boolean, confirmLeave: () => Promise<boolean>): void {
  const confirmRef = useRef(confirmLeave);
  useEffect(() => {
    confirmRef.current = confirmLeave;
  });

  useEffect(() => {
    if (!active) return;
    return setLeaveGuard(() => confirmRef.current());
  }, [active]);

  // Client-side navigation does not trigger the browser's warning.
  useConfirmLinkNavigation(active && dirty);

  useEffect(() => {
    if (!active || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active, dirty]);
}
