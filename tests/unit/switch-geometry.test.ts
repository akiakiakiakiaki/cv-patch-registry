import { describe, expect, it } from "vitest";
import { PALETTE_ITEMS, controlTypeKey } from "@/components/synth-editor/palette";
import { switchRect } from "@/lib/instrument/geometry";

describe("switchRect", () => {
  const button = { shape: "rect" as const, width: 34, height: 32, cornerRadius: 5 };
  it("keeps the button size and doubles the width for slide switches", () => {
    expect(switchRect(button, undefined)).toEqual({ width: 34, height: 32, cornerRadius: 5 });
    expect(switchRect(button, "slide")).toEqual({ width: 68, height: 32, cornerRadius: 5 });
  });
});

describe("palette", () => {
  it("lists the slide switch right after the push button", () => {
    expect(PALETTE_ITEMS.map(controlTypeKey)).toEqual(["knob", "switch", "slide", "led", "in", "out", "uni"]);
  });
  it("names only switches by their style", () => {
    expect(controlTypeKey({ kind: "switch", style: "slide" })).toBe("slide");
    expect(controlTypeKey({ kind: "led", style: "slide" })).toBe("led");
  });
});
