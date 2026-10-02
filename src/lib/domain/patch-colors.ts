export const PATCH_CABLE_COLOR_IDS = [
  "black",
  "white",
  "gray",
  "yellow",
  "red",
  "blue",
] as const;

export type PatchCableColorId = (typeof PATCH_CABLE_COLOR_IDS)[number];
export const DEFAULT_PATCH_CABLE_COLOR_ID: PatchCableColorId = "red";
