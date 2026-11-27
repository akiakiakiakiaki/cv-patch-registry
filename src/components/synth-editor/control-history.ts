/**
 * Undo/redo history of editor snapshots. Changes of the same kind on the same control that follow each other
 * within COALESCE_MS (a drag, held arrow keys, typing a label) become one step.
 */
export interface History<T> {
  past: readonly T[];
  future: readonly T[];
  lastKey?: string;
  lastAt?: number;
}

export const COALESCE_MS = 1000;

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] };
}

/** Records the state before a change. `key` names the kind of change and its control, e.g. `move:knob-1`. */
export function recordChange<T>(history: History<T>, previous: T, key: string | undefined, now: number): History<T> {
  const coalesce = key !== undefined && key === history.lastKey && history.lastAt !== undefined && now - history.lastAt < COALESCE_MS;
  return {
    past: coalesce ? history.past : [...history.past, previous],
    future: [],
    lastKey: key,
    lastAt: now,
  };
}

export function undoStep<T>(history: History<T>, current: T): { history: History<T>; value: T } | null {
  const value = history.past.at(-1);
  if (value === undefined) return null;
  return { value, history: { past: history.past.slice(0, -1), future: [current, ...history.future] } };
}

export function redoStep<T>(history: History<T>, current: T): { history: History<T>; value: T } | null {
  const [value, ...rest] = history.future;
  if (value === undefined) return null;
  return { value, history: { past: [...history.past, current], future: rest } };
}

export type EditorShortcut = "undo" | "redo" | "copy" | "paste";

/**
 * Editor shortcuts: Cmd/Ctrl+Z undoes, Cmd/Ctrl+Shift+Z redoes, Cmd/Ctrl+C copies and Cmd/Ctrl+V pastes the
 * focused control. Text fields keep their own undo, copy and paste, and so does selected text on the page.
 */
export function editorShortcut(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "target">): EditorShortcut | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  const action: EditorShortcut | null = key === "z" ? (event.shiftKey ? "redo" : "undo") : event.shiftKey ? null : key === "c" ? "copy" : key === "v" ? "paste" : null;
  if (!action) return null;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true']"))) return null;
  if (action === "copy" && target instanceof Node && Boolean(target.ownerDocument?.getSelection()?.toString())) return null;
  return action;
}
