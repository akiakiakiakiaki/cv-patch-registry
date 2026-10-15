import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SynthLayoutEditor } from "@/components/synth-editor/SynthLayoutEditor";
import { I18nProvider } from "@/i18n/provider";
import { testLayout } from "../fixtures/instrument";

// jsdom has no SVG coordinate system: the pointer maps 1:1 to panel units.
beforeAll(() => {
  Object.defineProperty(SVGSVGElement.prototype, "createSVGPoint", {
    configurable: true,
    value: () => {
      const point = { x: 0, y: 0, matrixTransform: () => point };
      return point;
    },
  });
  Object.defineProperty(SVGSVGElement.prototype, "getScreenCTM", { configurable: true, value: () => null });
  Element.prototype.setPointerCapture = vi.fn();
});

const source = { slug: "drag-synth", displayName: "Drag", manufacturer: null, revision: 1, panelUrl: "/x.png", layout: testLayout };

describe("dragging layout elements", () => {
  it("moves a placed control with the mouse in half-unit steps", () => {
    const { container } = render(
      <I18nProvider locale="en">
        <SynthLayoutEditor source={source} onSaved={vi.fn()} onClose={vi.fn()} onDeleted={vi.fn()} />
      </I18nProvider>,
    );
    const svg = container.querySelector("svg[aria-label]") as SVGSVGElement;
    const knob = container.querySelector("circle[aria-label*=\"Test knob\"]") as Element;
    fireEvent.pointerDown(knob, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 130.2, clientY: 90, pointerId: 1 });
    expect(screen.getByRole("spinbutton", { name: "X" })).toHaveValue(130);
    expect(screen.getByRole("spinbutton", { name: "Y" })).toHaveValue(90);
  });
});

describe("dragging newly placed controls", () => {
  it.each([
    ["Add Switch", "switch-"],
    ["Add LED", "led-"],
    ["Add Input", "In 1"],
    ["Add Uni", "Uni 1"],
  ])("%s then drags the placed element with the mouse", (button, label) => {
    const { container } = render(
      <I18nProvider locale="en">
        <SynthLayoutEditor source={source} onSaved={vi.fn()} onClose={vi.fn()} onDeleted={vi.fn()} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: button }));
    const svg = container.querySelector("svg[aria-label]") as SVGSVGElement;
    const hit = container.querySelector(`svg [aria-label*="${label}"]`) as Element;
    expect(hit).not.toBeNull();
    fireEvent.pointerDown(hit, { clientX: 400, clientY: 300, pointerId: 2 });
    fireEvent.pointerMove(svg, { clientX: 420.6, clientY: 310.2, pointerId: 2 });
    fireEvent.pointerUp(svg, { clientX: 420.6, clientY: 310.2, pointerId: 2 });
    const moved = screen.getByRole("spinbutton", { name: "X" });
    expect(Number((moved as HTMLInputElement).value)).toBeGreaterThan(400);
    // After release, further moves must be ignored.
    fireEvent.pointerMove(svg, { clientX: 10, clientY: 10, pointerId: 2 });
    expect(Number((screen.getByRole("spinbutton", { name: "X" }) as HTMLInputElement).value)).toBeGreaterThan(400);
  });
});
