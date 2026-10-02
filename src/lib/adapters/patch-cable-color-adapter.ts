import {
  DEFAULT_PATCH_CABLE_COLOR_ID,
  PATCH_CABLE_COLOR_IDS,
} from "@/lib/domain/patch-colors";
import type { PatchCableColorId } from "@/lib/domain/patch-colors";

const FALLBACK_HEX: Record<PatchCableColorId, string> = {
  black: "#17191c",
  white: "#ffffff",
  gray: "#888d94",
  yellow: "#f5d547",
  red: "#e8413a",
  blue: "#3178df",
};

export interface PatchCableColorOption {
  id: PatchCableColorId;
  cssColor: string;
}

export const PATCH_CABLE_COLOR_OPTIONS: readonly PatchCableColorOption[] =
  PATCH_CABLE_COLOR_IDS.map((id) => ({
    id,
    cssColor: patchCableColorCssValue(id),
  }));

export function isPatchCableColorId(value: unknown): value is PatchCableColorId {
  return (
    typeof value === "string" &&
    PATCH_CABLE_COLOR_IDS.some((colorId) => colorId === value)
  );
}

export function normalizePatchCableColorId(value: unknown): PatchCableColorId {
  if (isPatchCableColorId(value)) return value;
  return DEFAULT_PATCH_CABLE_COLOR_ID;
}

export function patchCableColorCssValue(colorId: PatchCableColorId): string {
  return `var(--patch-color-${colorId}, ${FALLBACK_HEX[colorId]})`;
}
