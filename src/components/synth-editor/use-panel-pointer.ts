"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { panelPointOf } from "@/components/instrument-panel/utils";
import type { Point } from "@/lib/instrument/layout";

/**
 * Where the pointer is over the panel, asked for on demand (e.g. when pasting). Moving the pointer only
 * remembers its screen position: no render and no conversion per move; panel units are computed when asked.
 * Returns null when the pointer is not over the panel.
 */
export function usePanelPointer(panelRef: RefObject<SVGSVGElement | null>, panel: { width: number; height: number }): () => Point | null {
  const client = useRef<{ clientX: number; clientY: number } | null>(null);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      client.current = { clientX: event.clientX, clientY: event.clientY };
    };
    const leave = () => {
      client.current = null;
    };
    window.addEventListener("pointermove", move);
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, []);
  return useCallback(
    () => (client.current && panelRef.current ? panelPointOf(panelRef.current, client.current, panel) : null),
    [panelRef, panel],
  );
}
