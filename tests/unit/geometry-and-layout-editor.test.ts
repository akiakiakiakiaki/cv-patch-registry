import { describe, expect, it } from "vitest";
import { cableCurve, getNearestPort } from "@/lib/instrument/geometry";
import { moveLayoutElement } from "@/lib/instrument/layout-editor";
import type { PatchPort } from "@/lib/instrument/layout";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";

describe("instrument geometry", () => {
  it("creates a cable curve that starts and ends at its ports", () => {
    expect(cableCurve({ x: 10, y: 20 }, { x: 90, y: 40 })).toMatch(
      /^M 10 20 C .* 90 40$/,
    );
  });

  it("finds a port within the snap radius and ignores points outside it", () => {
    const ports: PatchPort[] = [
      { id: "in-a", label: "A", kind: "in", x: 20, y: 20 },
    ];
    expect(getNearestPort({ x: 22, y: 20 }, ports, 5)).toBe(ports[0]);
    expect(getNearestPort({ x: 25, y: 20 }, ports, 5)).toBeUndefined();
  });
});

describe("layout editor", () => {
  it("moves the selected element and clamps it to the viewBox", () => {
    const start = behringerProton.layout;
    const knob = start.knobs[0]!;
    const moved = moveLayoutElement(start, { kind: "knob", id: knob.id }, { x: 0.5, y: -0.5 });
    expect(moved.knobs[0]).toMatchObject({ x: knob.x + 0.5, y: knob.y - 0.5 });

    const clamped = moveLayoutElement(
      start,
      { kind: "port", id: start.ports[0]!.id },
      { x: -start.viewBox.width, y: start.viewBox.height * 2 },
    );
    expect(clamped.ports[0]).toMatchObject({ x: 0, y: 650.5 });
  });

  it("snaps moved positions to the nearest whole or half pixel", () => {
    const start = structuredClone(behringerProton.layout);
    start.knobs[0]!.x = 100.2;
    start.knobs[0]!.y = 100.2;

    const moved = moveLayoutElement(
      start,
      { kind: "knob", id: start.knobs[0]!.id },
      { x: 0.5, y: -0.5 },
    );

    expect(moved.knobs[0]).toMatchObject({ x: 100.5, y: 99.5 });
  });

  it("returns the existing layout if the selected element does not exist", () => {
    expect(moveLayoutElement(behringerProton.layout, { kind: "led", id: "missing" }, { x: 1, y: 1 })).toBe(
      behringerProton.layout,
    );
  });
});
