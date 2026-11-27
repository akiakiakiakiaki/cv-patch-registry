import { CONTROL_KINDS, type ControlKind } from "@/lib/domain/control-ids";
import type { SwitchStyle } from "@/lib/instrument/layout";
import type { EditorControl } from "@/components/synth-editor/draft-state";

/** What the editor can place: a control kind, for switches optionally with its construction. */
export interface PaletteItem {
  kind: ControlKind;
  style?: SwitchStyle;
}

/** Palette order: the kinds in their usual order, the slide switch right after the push button. */
export const PALETTE_ITEMS: readonly PaletteItem[] = CONTROL_KINDS.flatMap((kind): PaletteItem[] =>
  kind === "switch" ? [{ kind }, { kind, style: "slide" }] : [{ kind }],
);

/** Message key part for a control's type, e.g. "switch" or "slide" (see synths.kind.*). */
export type ControlTypeKey = ControlKind | SwitchStyle;

export function controlTypeKey(item: Pick<EditorControl, "kind" | "style">): ControlTypeKey {
  return item.kind === "switch" && item.style === "slide" ? "slide" : item.kind;
}
