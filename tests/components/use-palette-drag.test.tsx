import { act, fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePaletteDrag } from "@/components/synth-editor/use-palette-drag";

/** An SVG whose client points map 1:1 to panel units. */
function panelSvg() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  Object.defineProperty(svg, "createSVGPoint", {
    value: () => {
      const point = { x: 0, y: 0, matrixTransform: () => ({ x: point.x, y: point.y }) };
      return point;
    },
  });
  Object.defineProperty(svg, "getScreenCTM", { value: () => ({ inverse: () => ({}) }) });
  return svg;
}

describe("usePaletteDrag", () => {
  it("renders again only when the pointer reaches another point of the panel", () => {
    const panelRef = { current: panelSvg() };
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return usePaletteDrag(panelRef, { width: 100, height: 50 }, vi.fn());
    });
    act(() => result.current.start({ kind: "switch", style: "slide" }));
    expect(result.current.dragging).toBe(true);

    act(() => void fireEvent.pointerMove(window, { clientX: 10, clientY: 20 }));
    const placement = result.current.placement;
    expect(placement).toEqual({ kind: "switch", style: "slide", point: { x: 10, y: 20 } });
    const rendersAtPoint = renders;

    // The browser repeats pointermove for a resting pointer when the page changes underneath it.
    for (let index = 0; index < 100; index += 1) act(() => void fireEvent.pointerMove(window, { clientX: 10, clientY: 20 }));
    // React may call the hook once more before it bails out, but never once per event.
    expect(renders).toBeLessThanOrEqual(rendersAtPoint + 1);
    expect(result.current.placement).toBe(placement);

    act(() => void fireEvent.pointerMove(window, { clientX: 11, clientY: 20 }));
    expect(result.current.placement?.point).toEqual({ x: 11, y: 20 });
  });

  it("drops inside the panel and cancels outside", () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => usePaletteDrag({ current: panelSvg() }, { width: 100, height: 50 }, onDrop));
    act(() => result.current.start({ kind: "knob" }));
    act(() => void fireEvent.pointerUp(window, { clientX: 500, clientY: 20 }));
    expect(onDrop).not.toHaveBeenCalled();
    expect(result.current.dragging).toBe(false);

    act(() => result.current.start({ kind: "knob" }));
    act(() => void fireEvent.pointerUp(window, { clientX: 30, clientY: 40 }));
    expect(onDrop).toHaveBeenCalledWith({ kind: "knob" }, { x: 30, y: 40 });
    expect(result.current.placement).toBeNull();
  });
});
