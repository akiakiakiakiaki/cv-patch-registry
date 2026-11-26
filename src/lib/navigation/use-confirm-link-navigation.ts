"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { confirmLeave } from "@/lib/navigation/leave-guard";

/**
 * While `active`, clicks on links to other pages of the app ask confirmLeave first and navigate only afterwards.
 * Client-side navigation does not fire `beforeunload`, so without this the app's own links (header, explore,
 * footer) would leave unsaved work silently. Links that open a new tab, downloads and external links are untouched;
 * the browser warns about the latter via `beforeunload`.
 */
export function useConfirmLinkNavigation(active: boolean): void {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const samePage = url.pathname === window.location.pathname && url.search === window.location.search;
      if (samePage) return;
      // Captured on the document, before React and the link's own handler see the click.
      event.preventDefault();
      event.stopPropagation();
      void confirmLeave().then((leave) => {
        if (leave) router.push(`${url.pathname}${url.search}${url.hash}`);
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active, router]);
}
