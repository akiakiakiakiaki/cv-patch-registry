/**
 * What the sheet is used for. Each mode decides which parts of the page are shown (see sheetModeLayout);
 * switching modes goes through PatchSheet's requestMode, which first asks the current mode whether it may be left.
 */
export type SheetMode = "patching" | "editingSynth";

export interface SheetModeLayout {
  /** The patch row below the top bar (active patch name, visibility, tags, save status). */
  patchRow: boolean;
  /** The patch functions in the top bar (patch list, new patch, download, import). */
  patchActions: boolean;
  /** Fill the window between header and footers on wide screens, with the content scrolling inside. */
  fillWindow: boolean;
}

const LAYOUTS: Readonly<Record<SheetMode, SheetModeLayout>> = {
  patching: { patchRow: true, patchActions: true, fillWindow: false },
  editingSynth: { patchRow: false, patchActions: false, fillWindow: true },
};

export function sheetModeLayout(mode: SheetMode): SheetModeLayout {
  return LAYOUTS[mode];
}
