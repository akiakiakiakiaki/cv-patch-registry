import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstrumentPanel } from "@/components/instrument-panel/InstrumentPanel";
import { I18nProvider } from "@/i18n/provider";
import type { PatchCable, PatchData } from "@/lib/domain/types";
import { PATCH_CABLE_COLOR_IDS } from "@/lib/domain/patch-colors";
import { testInstrument, testLayout } from "../fixtures/instrument";

const emptyData: PatchData = { knobs: {}, switches: {}, leds: {}, cables: [] };

function renderPanel(data: PatchData = emptyData) {
  const props = {
    data,
    instrument: testInstrument,
    layout: testLayout,
    layoutEditMode: false,
    focusedElement: null,
    onFocusLayoutElement: vi.fn(),
    onClearLayoutFocus: vi.fn(),
    onMoveFocusedLayoutElement: vi.fn(),
    onKnobChange: vi.fn(),
    onSwitchChange: vi.fn(),
    onLedChange: vi.fn(),
    onCableChange: vi.fn<(cables: PatchCable[]) => void>(),
  };
  const view = render(
    <I18nProvider locale="en">
      <InstrumentPanel {...props} />
    </I18nProvider>,
  );
  const svg = view.container.querySelector("svg");
  if (!svg) throw new Error("Instrument SVG was not rendered");
  Object.defineProperty(svg, "createSVGPoint", {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      matrixTransform() {
        return this;
      },
    }),
  });
  Object.defineProperty(svg, "getScreenCTM", {
    configurable: true,
    value: () => null,
  });
  Object.defineProperty(svg, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  return { ...view, props, svg };
}

function startPortDrag(
  element: Element,
  pointerId: number,
  point: { x: number; y: number },
) {
  fireEvent.pointerDown(element, {
    pointerId,
    clientX: point.x,
    clientY: point.y,
  });
}

function finishPortDrag(
  svg: SVGSVGElement,
  pointerId: number,
  point: { x: number; y: number },
) {
  fireEvent.pointerMove(svg, {
    pointerId,
    clientX: point.x,
    clientY: point.y,
  });
  fireEvent.pointerUp(svg, {
    pointerId,
    clientX: point.x,
    clientY: point.y,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("InstrumentPanel", () => {
  it("updates knobs, switches, and LEDs through keyboard and click interactions", () => {
    const { props } = renderPanel();

    fireEvent.keyDown(screen.getByRole("slider", { name: "Test knob" }), {
      key: "ArrowRight",
    });
    fireEvent.click(screen.getByRole("button", { name: "Test switch" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Test LED" }));

    expect(props.onKnobChange).toHaveBeenCalledWith("Test knob", 65);
    expect(props.onSwitchChange).toHaveBeenCalledWith("Test switch", true);
    expect(props.onLedChange).toHaveBeenCalledWith("Test LED", true);
  });

  it("advertises the MIDI range and clamps keyboard changes at the upper bound", () => {
    const { props } = renderPanel({
      ...emptyData,
      knobs: { "Test knob": 127 },
    });
    const slider = screen.getByRole("slider", { name: "Test knob" });
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "127");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(props.onKnobChange).toHaveBeenCalledWith("Test knob", 127);
  });

  it("shows a live cable preview and connects output to input on release", () => {
    const { container, props, svg } = renderPanel();
    const output = screen.getByRole("button", { name: "Output Out A" });

    startPortDrag(output, 1, { x: 100, y: 300 });
    expect(container.querySelector('path[class*="cablePreview"]')).toBeInTheDocument();
    finishPortDrag(svg, 1, { x: 800, y: 300 });

    expect(props.onCableChange).toHaveBeenCalledWith([
      { from: "out-a", to: "in-a", colorId: PATCH_CABLE_COLOR_IDS[0] },
    ]);
  });

  it("canonicalizes a cable dragged from input to output", () => {
    const { props, svg } = renderPanel();
    const input = screen.getByRole("button", { name: "Input In B" });

    startPortDrag(input, 2, { x: 800, y: 400 });
    finishPortDrag(svg, 2, { x: 100, y: 400 });

    expect(props.onCableChange).toHaveBeenCalledWith([
      { from: "out-b", to: "in-b", colorId: PATCH_CABLE_COLOR_IDS[0] },
    ]);
  });

  it("opens the cable color picker on one endpoint click and applies the chosen color", () => {
    vi.useFakeTimers();
    const cable: PatchCable = {
      from: "out-a",
      to: "in-a",
      colorId: PATCH_CABLE_COLOR_IDS[4],
    };
    const { props, svg } = renderPanel({ ...emptyData, cables: [cable] });
    const endpoint = screen.getByLabelText("Drag cable end at Out A");

    startPortDrag(endpoint, 3, { x: 100, y: 300 });
    fireEvent.pointerUp(svg, { pointerId: 3, clientX: 100, clientY: 300 });
    act(() => vi.advanceTimersByTime(400));

    const picker = screen.getByRole("group", { name: "Choose patch cable color" });
    fireEvent.click(picker.querySelector('[aria-label="Blue"]')!);
    expect(props.onCableChange).toHaveBeenCalledWith([
      { ...cable, colorId: PATCH_CABLE_COLOR_IDS[5] },
    ]);
  });

  it("renders the color picker above patch ports so its options receive pointer input", () => {
    vi.useFakeTimers();
    const cable: PatchCable = {
      from: "out-a",
      to: "in-a",
      colorId: PATCH_CABLE_COLOR_IDS[4],
    };
    const { props, svg } = renderPanel({ ...emptyData, cables: [cable] });
    startPortDrag(
      screen.getByLabelText("Drag cable end at Out A"),
      9,
      { x: 100, y: 300 },
    );
    fireEvent.pointerUp(svg, { pointerId: 9, clientX: 100, clientY: 300 });
    act(() => vi.advanceTimersByTime(400));

    const picker = screen.getByRole("group", {
      name: "Choose patch cable color",
    });
    const input = screen.getByRole("button", { name: "Input In A" });
    const blueOption = within(picker).getByRole("button", { name: "Blue" });
    expect(
      input.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.pointerDown(blueOption);
    fireEvent.pointerUp(svg, { pointerId: 10, clientX: 800, clientY: 300 });
    fireEvent.click(blueOption);

    expect(props.onCableChange).toHaveBeenCalledTimes(1);
    expect(props.onCableChange).toHaveBeenCalledWith([
      { ...cable, colorId: PATCH_CABLE_COLOR_IDS[5] },
    ]);
  });

  it("closes the color picker when pointer input happens outside it", () => {
    vi.useFakeTimers();
    const cable: PatchCable = {
      from: "out-a",
      to: "in-a",
      colorId: PATCH_CABLE_COLOR_IDS[4],
    };
    const { svg } = renderPanel({ ...emptyData, cables: [cable] });
    startPortDrag(screen.getByLabelText("Drag cable end at Out A"), 8, {
      x: 100,
      y: 300,
    });
    fireEvent.pointerUp(svg, { pointerId: 8, clientX: 100, clientY: 300 });
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole("group", { name: "Choose patch cable color" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("group", { name: "Choose patch cable color" })).not.toBeInTheDocument();
  });

  it("deletes a cable when the same endpoint is clicked twice", () => {
    vi.useFakeTimers();
    const cable: PatchCable = {
      from: "out-a",
      to: "in-a",
      colorId: PATCH_CABLE_COLOR_IDS[4],
    };
    const { props, svg } = renderPanel({ ...emptyData, cables: [cable] });
    for (const pointerId of [4, 5]) {
      const endpoint = screen.getByLabelText("Drag cable end at Out A");
      startPortDrag(endpoint, pointerId, { x: 100, y: 300 });
      fireEvent.pointerUp(svg, { pointerId, clientX: 100, clientY: 300 });
    }

    expect(props.onCableChange).toHaveBeenCalledWith([]);
  });

  it("rewires a cable to another compatible endpoint", () => {
    const cable: PatchCable = {
      from: "out-a",
      to: "in-a",
      colorId: PATCH_CABLE_COLOR_IDS[2],
    };
    const { props, svg } = renderPanel({ ...emptyData, cables: [cable] });
    startPortDrag(screen.getByLabelText("Drag cable end at Out A"), 9, {
      x: 100,
      y: 300,
    });
    finishPortDrag(svg, 9, { x: 100, y: 400 });

    expect(props.onCableChange).toHaveBeenCalledWith([
      { from: "out-b", to: "in-a", colorId: cable.colorId },
    ]);
  });

  it("removes a cable when its endpoint is dragged away from all ports", () => {
    const cable: PatchCable = {
      from: "out-a",
      to: "in-a",
      colorId: PATCH_CABLE_COLOR_IDS[2],
    };
    const { props, svg } = renderPanel({ ...emptyData, cables: [cable] });
    startPortDrag(screen.getByLabelText("Drag cable end at Out A"), 10, {
      x: 100,
      y: 300,
    });
    finishPortDrag(svg, 10, { x: 500, y: 500 });

    expect(props.onCableChange).toHaveBeenCalledWith([]);
  });

  it("does not connect same-kind ports or reuse a connected input", () => {
    const { props, svg } = renderPanel();
    startPortDrag(screen.getByRole("button", { name: "Output Out A" }), 6, {
      x: 100,
      y: 300,
    });
    finishPortDrag(svg, 6, { x: 100, y: 400 });
    expect(props.onCableChange).not.toHaveBeenCalled();

    const existingCable: PatchCable = {
      from: "out-a",
      to: "in-a",
      colorId: PATCH_CABLE_COLOR_IDS[4],
    };
    const occupied = renderPanel({ ...emptyData, cables: [existingCable] });
    startPortDrag(within(occupied.container).getByRole("button", { name: "Output Out B" }), 7, {
      x: 100,
      y: 400,
    });
    finishPortDrag(occupied.svg, 7, { x: 800, y: 300 });
    expect(occupied.props.onCableChange).not.toHaveBeenCalled();
  });
});
