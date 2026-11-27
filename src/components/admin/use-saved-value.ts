"use client";

import { useEffect, useState } from "react";

/**
 * A value that lives on the server, shown the same way by every control: while saving, the control keeps the old
 * value (`saving` disables it); it takes the new value once the server confirms it. A failed save keeps the old
 * value and calls `onError`.
 */
export function useSavedValue<T>(
  value: T,
  save: (next: T) => Promise<T | null>,
  callbacks: { onSaved?: (value: T) => void; onError?: () => void } = {},
) {
  const [shown, setShown] = useState(value);
  const [saving, setSaving] = useState(false);
  // A change from elsewhere (e.g. reloaded data) is shown too.
  useEffect(() => setShown(value), [value]);

  async function change(next: T) {
    setSaving(true);
    const confirmed = await save(next);
    setSaving(false);
    if (confirmed === null) return callbacks.onError?.();
    setShown(confirmed);
    callbacks.onSaved?.(confirmed);
  }

  return { shown, saving, change };
}
