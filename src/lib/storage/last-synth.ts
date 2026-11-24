const LAST_SYNTH_KEY = "patch-sheet:last-synth";

/** The synth this browser opened last; null when unknown or storage is unavailable. */
export function readLastSynth(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(LAST_SYNTH_KEY);
  } catch {
    return null;
  }
}

export function writeLastSynth(slug: string): void {
  try {
    window.localStorage.setItem(LAST_SYNTH_KEY, slug);
  } catch {
    // Remembering the synth is a convenience; private windows may refuse storage.
  }
}

/** The synth to open without one in the URL: the last opened one if still listed, otherwise the first of the list. */
export function initialSynthSlug(remembered: string | null, catalog: readonly { slug: string }[]): string | null {
  if (remembered && catalog.some((item) => item.slug === remembered)) return remembered;
  return catalog[0]?.slug ?? null;
}
