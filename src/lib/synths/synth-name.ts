import { LEGACY_PROTON_SLUG } from "@/lib/adapters/proton-legacy-migration-adapter";
import type { MessageKey, MessageValues } from "@/i18n/messages";

type Translate = (key: MessageKey, values?: MessageValues) => string;

/** Synths kept only until their editable successors replace them (see the legacy Proton). */
export function isLegacySynth(slug: string): boolean {
  return slug === LEGACY_PROTON_SLUG;
}

/**
 * A synth's name as the app shows it everywhere: a legacy synth is marked, since it may share its name with its
 * successor (e.g. "Behringer Proton (Legacy)" next to the editable "Behringer Proton").
 */
export function synthName(t: Translate, synth: { slug: string; displayName: string }): string {
  return isLegacySynth(synth.slug) ? t("instrument.legacyName", { name: synth.displayName }) : synth.displayName;
}
