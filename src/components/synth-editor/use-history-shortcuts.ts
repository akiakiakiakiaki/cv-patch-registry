"use client";

import { useEffect, useRef } from "react";
import { historyShortcut } from "@/components/synth-editor/control-history";

/** Cmd/Ctrl+Z undoes, Cmd/Ctrl+Shift+Z redoes, except in text fields (see historyShortcut) and open dialogs. */
export function useHistoryShortcuts(undo: () => void, redo: () => void): void {
  const actions = useRef({ undo, redo });
  useEffect(() => {
    actions.current = { undo, redo };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = historyShortcut(event);
      if (!action || (event.target instanceof Element && event.target.closest('[role="dialog"]'))) return;
      event.preventDefault();
      actions.current[action]();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
