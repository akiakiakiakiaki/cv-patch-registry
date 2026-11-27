import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PaletteGhost } from "@/components/synth-editor/PaletteGhost";
import type { PaletteItem } from "@/components/synth-editor/palette";
import { testLayout } from "../fixtures/instrument";

function ghost(item: PaletteItem) {
  const { container } = render(<PaletteGhost item={item} layout={testLayout} />);
  return container.querySelector("svg")!;
}

const animations = (svg: SVGSVGElement) => [...svg.querySelectorAll("[data-animation]")].map((element) => element.getAttribute("data-animation"));

describe("palette behavior preview", () => {
  it("turns the knob indicator through the knob's sweep", () => {
    const svg = ghost({ kind: "knob" });
    const turning = svg.querySelector('[data-animation="turn"]') as SVGGElement;
    expect(turning.style.getPropertyValue("--sweep")).toBe(`${testLayout.knobSweepAngle}deg`);
    expect(turning.querySelector("line")).not.toBeNull();
    // A visible body, since knobs are transparent on the panel.
    expect(svg.querySelector("circle")).not.toBeNull();
  });

  it("switches a push button and an LED on and off", () => {
    expect(animations(ghost({ kind: "switch" }))).toEqual(["blink"]);
    expect(animations(ghost({ kind: "led" }))).toEqual(["blink"]);
  });

  it("moves the slide switch's thumb by half the track", () => {
    const svg = ghost({ kind: "switch", style: "slide" });
    const sliding = svg.querySelector('[data-animation="slide"]') as SVGGElement;
    expect(sliding.style.getPropertyValue("--travel")).toBe(`${testLayout.geometry.switch.width}px`);
    expect(sliding.querySelectorAll("rect")).toHaveLength(1);
  });

  it("shows ports without animation", () => {
    for (const kind of ["in", "out", "uni"] as const) expect(animations(ghost({ kind }))).toEqual([]);
  });
});
