import { behringerProton } from "@/lib/instruments/behringer-proton/definition";

/** Built-in synths kept next to their editable clones until they are removed. */
export const LEGACY_SYNTH_SLUGS: readonly string[] = [behringerProton.id];

/**
 * FEATURE_LEGACY_SYNTHS=false hides legacy synths and their patches everywhere (lists, views, links, saving).
 * Their data stays in the database. Any other value, including none, keeps them visible.
 */
export function legacySynthsVisible(): boolean {
  return process.env.FEATURE_LEGACY_SYNTHS !== "false";
}

export function hiddenSynthSlugs(): readonly string[] {
  return legacySynthsVisible() ? [] : LEGACY_SYNTH_SLUGS;
}
