"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  FocusedLayoutElement,
  InstrumentLayout,
} from "@/lib/instrument/layout";
import { moveLayoutElement } from "@/lib/instrument/layout-editor";
import {
  loadInstrumentLayout,
  saveInstrumentLayout,
} from "@/lib/storage/instrument-layout-client";
import type { InstrumentDefinition } from "@/lib/instruments/types";
import { useI18n } from "@/i18n/provider";

export function useInstrumentLayoutEditor(
  instrument: InstrumentDefinition,
  enabled: boolean,
) {
  const { t } = useI18n();
  const [layout, setLayout] = useState<InstrumentLayout>(instrument.layout);
  const [focusedElement, setFocusedElement] =
    useState<FocusedLayoutElement | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setLayout(instrument.layout);
    setDirty(false);
    setFocusedElement(null);
    if (!enabled) return;
    let active = true;
    void loadInstrumentLayout(instrument)
      .then((savedLayout) => {
        if (active) setLayout(savedLayout);
      })
      .catch(() => {
        if (active) setMessage(t("debug.loadError"));
      });
    return () => {
      active = false;
    };
  }, [enabled, instrument, t]);

  const focus = useCallback((target: FocusedLayoutElement) => {
    setFocusedElement(target);
  }, []);

  const clearFocus = useCallback(() => {
    setFocusedElement(null);
  }, []);

  const moveFocused = useCallback(
    (delta: { x: number; y: number }) => {
      if (!focusedElement) return;
      setLayout((current) => moveLayoutElement(current, focusedElement, delta));
      setDirty(true);
      setMessage(t("debug.unsaved"));
    },
    [focusedElement, t],
  );

  const save = useCallback(async () => {
    setSaving(true);
    setMessage(t("debug.savingLayout"));
    try {
      const savedLayout = await saveInstrumentLayout(layout, instrument);
      setLayout(savedLayout);
      setDirty(false);
      setMessage(t("debug.layoutSaved"));
    } catch {
      setMessage(t("debug.saveError"));
    } finally {
      setSaving(false);
    }
  }, [instrument, layout, t]);

  return {
    layout,
    focusedElement,
    dirty,
    saving,
    message,
    focus,
    clearFocus,
    moveFocused,
    save,
  };
}
