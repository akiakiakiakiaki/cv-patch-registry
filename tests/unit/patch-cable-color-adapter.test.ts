import { describe, expect, it } from "vitest";
import {
  normalizePatchCableColorId,
  PATCH_CABLE_COLOR_OPTIONS,
  patchCableColorCssValue,
} from "@/lib/adapters/patch-cable-color-adapter";

describe("patch cable color adapter", () => {
  it("maps each configured color option to its CSS variable and fallback", () => {
    expect(patchCableColorCssValue("blue")).toBe(
      "var(--patch-color-blue, #3178df)",
    );
    for (const option of PATCH_CABLE_COLOR_OPTIONS) {
      expect(option.cssColor).toBe(patchCableColorCssValue(option.id));
    }
  });

  it("normalizes color IDs and defaults unknown values", () => {
    expect(normalizePatchCableColorId("yellow")).toBe("yellow");
    expect(normalizePatchCableColorId("invalid")).toBe("red");
  });
});
