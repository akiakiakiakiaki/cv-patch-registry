import { describe, expect, it } from "vitest";
import { controlExtent } from "@/components/instrument-panel/control-layer/PlacementPreview";
import { requiredSchemaMinor } from "@/lib/adapters/instrument-layout-adapter";
import type { InstrumentLayout } from "@/lib/instrument/layout";
import { withOptional } from "@/lib/utils/objects";
import { testLayout } from "../fixtures/instrument";

const CAT = "cat-0000aaaa";
const category = { id: CAT, name: "Filter", color: "#43a047" };

describe("requiredSchemaMinor", () => {
  const cases: Array<[string, InstrumentLayout, number]> = [
    ["plain content", testLayout, 0],
    ["a uni port", { ...testLayout, ports: [...testLayout.ports, { id: "uni-a", label: "Uni", kind: "uni", x: 1, y: 1 }] }, 1],
    ["a category", { ...testLayout, categories: [category] }, 2],
    ["a slide switch", { ...testLayout, switches: [{ id: "s", x: 1, y: 1, style: "slide" }] }, 3],
    ["a scaled category", { ...testLayout, categories: [{ ...category, scale: 2 }] }, 4],
  ];
  it.each(cases)("needs the right minor for %s", (_name, layout, minor) => {
    expect(requiredSchemaMinor(layout)).toBe(minor);
  });

  it("takes the newest feature when several are used", () => {
    const layout: InstrumentLayout = { ...testLayout, categories: [category], switches: [{ id: "s", x: 1, y: 1, style: "slide" }] };
    expect(requiredSchemaMinor(layout)).toBe(3);
  });
});

describe("controlExtent", () => {
  const { knob, switch: button, led, port } = testLayout.geometry;
  it("covers the knob's indicator, the switch rectangle and the round controls", () => {
    const reach = Math.max(knob.hitRadius, knob.indicatorLength);
    expect(controlExtent({ kind: "knob" }, testLayout)).toEqual({ x: reach, y: reach });
    expect(controlExtent({ kind: "switch" }, testLayout)).toEqual({ x: button.width / 2, y: button.height / 2 });
    expect(controlExtent({ kind: "switch", style: "slide" }, testLayout)).toEqual({ x: button.width, y: button.height / 2 });
    expect(controlExtent({ kind: "led" }, testLayout)).toEqual({ x: led.hitRadius, y: led.hitRadius });
    expect(controlExtent({ kind: "uni" }, testLayout)).toEqual({ x: port.hitRadius, y: port.hitRadius });
  });
});

describe("withOptional", () => {
  it("sets the key, or removes it instead of storing undefined", () => {
    const control: { id: string; style?: "slide" } = { id: "s" };
    expect(withOptional(control, "style", "slide")).toEqual({ id: "s", style: "slide" });
    const styled: { id: string; style?: "slide" } = { id: "s", style: "slide" };
    const cleared = withOptional(styled, "style", undefined);
    expect(cleared).toEqual({ id: "s" });
    expect(Object.keys(cleared)).toEqual(["id"]);
  });
});
