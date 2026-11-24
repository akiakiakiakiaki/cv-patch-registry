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

/** Cmd/Ctrl+Z undoes, Cmd/Ctrl+Shift+Z redoes; text fields keep their own undo. */
export function historyShortcut(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "target">): "undo" | "redo" | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "z") return null;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true']"))) return null;
  return event.shiftKey ? "redo" : "undo";
}
