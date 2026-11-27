import { compile } from "sass";
import { describe, expect, it } from "vitest";

const css = (file: string) => compile(file).css.replace(/\s+/g, " ");

describe("slide switch motion", () => {
  it("moves the thumb on the panel exactly like in the palette preview", () => {
    const panel = css("src/components/instrument-panel/InstrumentPanel.module.scss");
    const preview = css("src/components/synth-editor/PaletteGhost.module.scss");

    const [, duration, easing] = /\.slideThumb \{[^}]*transition: transform (\d+)ms ([\w-]+)/.exec(panel) ?? [];
    const [, loop, loopEasing] = /\.slide \{[^}]*animation: slide (\d+)ms ([\w-]+) infinite/.exec(preview) ?? [];
    const [, restEnd] = /@keyframes slide \{ 0%, ([\d.]+)% \{/.exec(preview) ?? [];
    expect(duration && loop && restEnd).toBeTruthy();

    // The preview moves from the end of its rest to 50 %: that part of the loop is the panel's transition.
    expect(((50 - Number(restEnd)) / 100) * Number(loop)).toBeCloseTo(Number(duration));
    expect(loopEasing).toBe(easing);
  });
});
