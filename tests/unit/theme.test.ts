import { describe, expect, it } from "vitest";
import { LIGHT_PRIMARY } from "@/components/app-providers/theme";

function relativeLuminance(hex: string): number {
  const channels = hex.match(/[a-f\d]{2}/gi)?.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  if (!channels || channels.length !== 3) throw new Error(`Invalid hex color: ${hex}`);
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(first: string, second: string): number {
  const values = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

describe("application theme", () => {
  it("uses a light-theme primary color with readable contrast on white surfaces", () => {
    expect(contrastRatio(LIGHT_PRIMARY.main, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(LIGHT_PRIMARY.contrastText, LIGHT_PRIMARY.main)).toBeGreaterThanOrEqual(4.5);
  });
});
