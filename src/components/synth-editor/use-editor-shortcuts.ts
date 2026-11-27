"use client";

import { useEffect, useRef } from "react";
import { editorShortcut, type EditorShortcut } from "@/components/synth-editor/control-history";

/** Runs the editor's keyboard shortcuts (see editorShortcut), except in text fields and open dialogs. */
export function useEditorShortcuts(actions: Readonly<Record<EditorShortcut, () => void>>): void {
  const current = useRef(actions);
  useEffect(() => {
    current.current = actions;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = editorShortcut(event);
      if (!action || (event.target instanceof Element && event.target.closest('[role="dialog"]'))) return;
      event.preventDefault();
      current.current[action]();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
