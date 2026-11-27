"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type SynthCatalogItem } from "@/lib/api/client";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import { instrumentFromSynth } from "@/lib/instruments/from-synth";
import type { InstrumentDefinition } from "@/lib/instruments/types";
import { initialSynthSlug, readLastSynth, writeLastSynth } from "@/lib/storage/last-synth";
import type { SynthView } from "@/lib/synths/synth-service";
import { useI18n } from "@/i18n/provider";
import { synthName } from "@/lib/synths/synth-name";

export const BUILT_IN_SYNTH = behringerProton.id;

/**
 * The synths the user can pick, the selected one and its loaded view. `initialSlug` comes from the URL; without it
 * the last opened (else first) synth of the catalog is selected. The selection is remembered for the next visit.
 */
export function useSynthCatalog(initialSlug: string) {
  const { t } = useI18n();
  const [catalog, setCatalog] = useState<SynthCatalogItem[] | null>(null);
  // Empty until known: the URL names a synth, or the catalog decides (last opened, else first).
  const [selectedSlug, setSelectedSlug] = useState(initialSlug);
  const [view, setView] = useState<SynthView | null>(null);

  // The built-in Proton comes with the app, but is only offered while the server lists it (FEATURE_LEGACY_SYNTHS).
  const builtInListed = catalog?.some((item) => item.slug === BUILT_IN_SYNTH) ?? false;
  const isBuiltIn = selectedSlug === BUILT_IN_SYNTH && builtInListed;
  // The selector must always offer the selected synth, even before the catalog has loaded (MUI warns otherwise).
  const selectorOptions = useMemo(() => {
    const items = catalog ?? [];
    if (!selectedSlug || items.some((item) => item.slug === selectedSlug)) return items;
    if (selectedSlug === BUILT_IN_SYNTH && catalog) return items;
    const fallbackName = selectedSlug === BUILT_IN_SYNTH ? behringerProton.displayName : selectedSlug;
    return [...items, { slug: selectedSlug, displayName: fallbackName, isBuiltIn: selectedSlug === BUILT_IN_SYNTH, approved: true }];
  }, [catalog, selectedSlug]);
  // The built-in Proton is kept next to its editable clone until removed; the list marks it as legacy.
  const instrumentOptions = useMemo(
    () =>
      selectorOptions.map((item) => ({
        id: item.slug,
        displayName: item.approved === false ? t("instrument.pendingName", { name: synthName(t, item) }) : synthName(t, item),
      })),
    [selectorOptions, t],
  );
  // Memoized: the instrument identity drives effects (layout and library loading); a new object per render would loop.
  const instrument: InstrumentDefinition | null = useMemo(
    () => (isBuiltIn ? behringerProton : view ? instrumentFromSynth(view) : null),
    [isBuiltIn, view],
  );

  const reloadCatalog = useCallback(async () => {
    const response = await api.synths.list();
    if (response.ok) setCatalog(response.data.synths);
  }, []);

  const reloadView = useCallback(async (slug: string) => {
    if (!slug || slug === BUILT_IN_SYNTH) return setView(null);
    const response = await api.synths.get(slug);
    setView(response.ok ? response.data : null);
  }, []);

  useEffect(() => {
    void reloadCatalog();
  }, [reloadCatalog]);

  useEffect(() => {
    if (!catalog) return;
    // Nothing chosen yet, or a link to the hidden legacy Proton: open the last or first listed synth instead.
    const hiddenBuiltIn = selectedSlug === BUILT_IN_SYNTH && !builtInListed;
    if (!selectedSlug || hiddenBuiltIn) setSelectedSlug(initialSynthSlug(readLastSynth(), catalog) ?? "");
  }, [catalog, selectedSlug, builtInListed]);

  useEffect(() => {
    if (selectedSlug) writeLastSynth(selectedSlug);
  }, [selectedSlug]);

  useEffect(() => {
    setView(null);
    void reloadView(selectedSlug);
  }, [selectedSlug, reloadView]);

  /** The synth to continue with once `slug` is gone (e.g. deleted). */
  const slugAfter = useCallback((slug: string) => (catalog ?? []).find((item) => item.slug !== slug)?.slug ?? "", [catalog]);

  return { selectedSlug, setSelectedSlug, view, instrument, isBuiltIn, instrumentOptions, reloadCatalog, reloadView, slugAfter };
}
