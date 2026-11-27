import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InstrumentPanel } from "@/components/instrument-panel/InstrumentPanel";
import { SynthLayoutEditor } from "@/components/synth-editor/SynthLayoutEditor";
import { I18nProvider } from "@/i18n/provider";
import type { PatchData } from "@/lib/domain/types";
import type { InstrumentLayout } from "@/lib/instrument/layout";
import { createLayoutSwitchAdapter } from "@/lib/instruments/generic-switch-adapter";
import { testInstrument, testLayout } from "../fixtures/instrument";

const slideLayout: InstrumentLayout = { ...testLayout, switches: [{ id: "Distortion", x: 200, y: 100, style: "slide" }] };
const categoryLayout: InstrumentLayout = {
  ...testLayout,
  categories: [{ id: "cat-0000aaaa", name: "Filter", color: "#43a047" }],
  switches: [{ id: "Distortion", x: 200, y: 100, style: "slide", category: "cat-0000aaaa" }],
};
const { width: buttonWidth, height } = testLayout.geometry.switch;

const onSwitchChange = vi.fn();

function panelElement(switches: PatchData["switches"] = {}, layout: InstrumentLayout = slideLayout) {
  return (
    <I18nProvider locale="en">
      <InstrumentPanel
        data={{ knobs: {}, switches, leds: {}, cables: [] }}
        instrument={{ ...testInstrument, layout, switchAdapter: createLayoutSwitchAdapter(layout) }}
        layout={layout}
        layoutEditMode={false}
        focusedElement={null}
        onFocusLayoutElement={vi.fn()}
        onClearLayoutFocus={vi.fn()}
        onMoveFocusedLayoutElement={vi.fn()}
        onKnobChange={vi.fn()}
        onSwitchChange={onSwitchChange}
        onLedChange={vi.fn()}
        onCableChange={vi.fn()}
      />
    </I18nProvider>
  );
}

function renderPanel(switches: PatchData["switches"] = {}, layout: InstrumentLayout = slideLayout) {
  onSwitchChange.mockClear();
  return { ...render(panelElement(switches, layout)), onSwitchChange };
}

/** The thumb is drawn right after the track. */
const thumbOf = (track: Element) => track.nextElementSibling as SVGRectElement;

describe("slide switch on the panel", () => {
  it("is twice as wide as a push button and toggles the switch state like one", () => {
    const { onSwitchChange } = renderPanel();
    const track = screen.getByRole("switch", { name: "Distortion" });
    expect(track).toHaveAttribute("aria-checked", "false");
    expect(Number(track.getAttribute("width"))).toBe(buttonWidth * 2);
    expect(Number(track.getAttribute("height"))).toBe(height);
    fireEvent.click(track);
    expect(onSwitchChange).toHaveBeenCalledWith({ Distortion: true });
    fireEvent.keyDown(track, { key: " " });
    expect(onSwitchChange).toHaveBeenCalledTimes(2);
  });

  it("shows the thumb left when off and glides it right when on, like the palette preview", () => {
    const { rerender } = renderPanel();
    const thumb = thumbOf(screen.getByRole("switch", { name: "Distortion" }));
    const offX = Number(thumb.getAttribute("x"));
    expect(offX).toBeLessThan(200);
    expect(thumb.style.transform).toBe("translateX(0px)");

    // Same element, moved by a transform: CSS animates it instead of jumping.
    rerender(panelElement({ Distortion: true }));
    const track = screen.getByRole("switch", { name: "Distortion" });
    expect(track).toHaveAttribute("aria-checked", "true");
    expect(thumbOf(track)).toBe(thumb);
    expect(Number(thumb.getAttribute("x"))).toBe(offX);
    expect(thumb.style.transform).toBe(`translateX(${buttonWidth}px)`);
    expect(offX + buttonWidth).toBeGreaterThan(200);
  });

  it("colors frame and thumb with the switch's category", () => {
    renderPanel({}, categoryLayout);
    const track = screen.getByRole("switch", { name: "Distortion" });
    // Both carry the category's class, which sets its color, and the rules that use it.
    expect(track).toHaveClass("cat-0000aaaa");
    expect(thumbOf(track)).toHaveClass("cat-0000aaaa");
    expect(track.getAttribute("class")).toMatch(/slideTrackCategory/);
    expect(thumbOf(track).getAttribute("class")).toMatch(/toggleCategory/);
  });

  it("draws the frame of a red slide switch red and keeps a blue one's frame neutral", () => {
    const red: InstrumentLayout = { ...testLayout, switches: [{ id: "Distortion", x: 200, y: 100, style: "slide" }] };
    const view = renderPanel({}, red);
    expect(screen.getByRole("switch", { name: "Distortion" }).getAttribute("class")).not.toMatch(/slideTrackRed|slideTrackCategory/);
    view.unmount();
    const redAdapterLayout: InstrumentLayout = { ...red };
    render(
      <I18nProvider locale="en">
        <InstrumentPanel
          data={{ knobs: {}, switches: {}, leds: {}, cables: [] }}
          instrument={{ ...testInstrument, layout: redAdapterLayout, switchAdapter: { ...createLayoutSwitchAdapter(redAdapterLayout), getState: (_switches, id) => ({ active: false, color: "red", stateKey: id }) } }}
          layout={redAdapterLayout}
          layoutEditMode={false}
          focusedElement={null}
          onFocusLayoutElement={vi.fn()}
          onClearLayoutFocus={vi.fn()}
          onMoveFocusedLayoutElement={vi.fn()}
          onKnobChange={vi.fn()}
          onSwitchChange={vi.fn()}
          onLedChange={vi.fn()}
          onCableChange={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole("switch", { name: "Distortion" }).getAttribute("class")).toMatch(/slideTrackRed/);
  });

  it("fills the thumb in both positions; only the position shows the state", () => {
    const off = renderPanel();
    const offClasses = thumbOf(screen.getByRole("switch", { name: "Distortion" })).getAttribute("class");
    off.unmount();
    renderPanel({ Distortion: true });
    const onClasses = thumbOf(screen.getByRole("switch", { name: "Distortion" })).getAttribute("class");
    expect(offClasses).toBe(onClasses);
    expect(offClasses).toMatch(/active/);
  });
});

const source = { slug: "slide-synth", displayName: "Slide", manufacturer: null, revision: 1, panelUrl: "/x.png", layout: testLayout };

function renderEditor() {
  return render(
    <I18nProvider locale="en">
      <SynthLayoutEditor source={source} onSaved={vi.fn()} onClose={vi.fn()} onDeleted={vi.fn()} />
    </I18nProvider>,
  );
}

describe("slide switch in the editor", () => {
  it("is offered right after the push button and placed by keyboard", () => {
    renderEditor();
    const palette = screen.getByRole("button", { name: "Add Switch" }).parentElement!;
    const labels = within(palette).getAllByRole("button").map((button) => button.textContent);
    expect(labels.indexOf("Add Slide switch")).toBe(labels.indexOf("Add Switch") + 1);
    fireEvent.click(screen.getByRole("button", { name: "Add Slide switch" }));
    expect(screen.getByRole("button", { name: /Switch 1 · Slide switch/ })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveTextContent("Slide switch");
  });

  it("turns an existing push button into a slide switch and back, keeping its ID", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Switches (1)" }));
    await user.click(screen.getByRole("button", { name: /Test switch · Switch/ }));
    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(await screen.findByRole("option", { name: "Slide switch" }));
    expect(await screen.findByRole("button", { name: /Test switch · Slide switch/ })).toBeInTheDocument();
    expect(screen.getByText("Slide switch · Test switch")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "Type" }));
    await user.click(await screen.findByRole("option", { name: "Switch" }));
    expect(await screen.findByRole("button", { name: /Test switch · Switch/ })).toBeInTheDocument();
  });

  it("previews each palette item on hover", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.hover(screen.getByRole("button", { name: "Add Slide switch" }));
    const ghost = await screen.findByTestId("palette-ghost-slide");
    // Track and thumb, as on the panel.
    expect(ghost.querySelectorAll("rect")).toHaveLength(2);
    await user.unhover(screen.getByRole("button", { name: "Add Slide switch" }));
    await waitFor(() => expect(screen.queryByTestId("palette-ghost-slide")).not.toBeInTheDocument());
    await user.hover(screen.getByRole("button", { name: "Add Knob" }));
    expect(await screen.findByTestId("palette-ghost-knob")).toBeInTheDocument();
    // The preview only describes; the button keeps its name.
    expect(screen.getByRole("button", { name: "Add Knob" })).toBeInTheDocument();
  });

  it("hides the preview while dragging from the palette and keeps it out of the pointer's way", async () => {
    const user = userEvent.setup();
    renderEditor();
    const button = screen.getByRole("button", { name: "Add Slide switch" });
    await user.hover(button);
    const ghost = await screen.findByTestId("palette-ghost-slide");
    // Not interactive: the pointer passes through the preview on its way to the panel.
    expect(ghost.closest(".MuiTooltip-popper")).not.toHaveClass("MuiTooltip-popperInteractive");
    fireEvent.pointerDown(button, { pointerId: 1 });
    await waitFor(() => expect(screen.queryByTestId("palette-ghost-slide")).not.toBeInTheDocument());
    fireEvent.pointerCancel(window, { pointerId: 1 });
  });
});

