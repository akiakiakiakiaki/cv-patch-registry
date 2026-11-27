import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InstrumentPanel } from "@/components/instrument-panel/InstrumentPanel";
import { SynthLayoutEditor } from "@/components/synth-editor/SynthLayoutEditor";
import { I18nProvider } from "@/i18n/provider";
import type { CategoryScale, InstrumentLayout } from "@/lib/instrument/layout";
import { createLayoutSwitchAdapter } from "@/lib/instruments/generic-switch-adapter";
import { testInstrument, testLayout } from "../fixtures/instrument";

const CAT = "cat-0000aaaa";
const OTHER = "cat-0000bbbb";
const { knob, led, switch: button } = testLayout.geometry;

function scaledLayout(scale: CategoryScale | undefined): InstrumentLayout {
  return {
    ...testLayout,
    categories: [
      { id: CAT, name: "Filter", color: "#43a047", ...(scale === undefined ? {} : { scale }) },
      { id: OTHER, name: "Shift", color: "#1e88e5", scale: 3 },
    ],
    knobs: [{ id: "Cutoff", x: 100, y: 100, category: CAT }, { id: "Plain knob", x: 400, y: 100 }],
    switches: [
      { id: "Drive", x: 200, y: 100, category: CAT },
      // Selector and dependent: no category of their own, so never scaled.
      { id: "Shift", x: 500, y: 100, selects: [CAT, OTHER] },
      { id: "Dependent", x: 600, y: 100, dependsOn: "Shift" },
    ],
    leds: [{ id: "Lamp", x: 300, y: 100, color: "red", category: CAT }],
  };
}

function renderPanel(layout: InstrumentLayout) {
  return render(
    <I18nProvider locale="en">
      <InstrumentPanel
        data={{ knobs: {}, switches: {}, leds: {}, cables: [] }}
        instrument={{ ...testInstrument, layout, switchAdapter: createLayoutSwitchAdapter(layout) }}
        layout={layout}
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
}

const num = (element: Element, attribute: string) => Number(element.getAttribute(attribute));

describe("category scale on the panel", () => {
  it("scales the category's knobs, LEDs and switches proportionally", () => {
    renderPanel(scaledLayout(2));
    expect(num(screen.getByRole("slider", { name: "Cutoff" }), "r")).toBe(knob.hitRadius * 2);
    expect(num(screen.getByRole("slider", { name: "Plain knob" }), "r")).toBe(knob.hitRadius);
    expect(num(screen.getByRole("checkbox", { name: "Lamp" }), "r")).toBe(led.hitRadius * 2);
    const drive = screen.getByRole("button", { name: "Drive" });
    expect([num(drive, "width"), num(drive, "height")]).toEqual([button.width * 2, button.height * 2]);
  });

  it("stretches switches per axis while round controls use the smaller factor", () => {
    renderPanel(scaledLayout({ x: 2, y: 0.5 }));
    expect(num(screen.getByRole("slider", { name: "Cutoff" }), "r")).toBe(knob.hitRadius * 0.5);
    expect(num(screen.getByRole("checkbox", { name: "Lamp" }), "r")).toBe(led.hitRadius * 0.5);
    const drive = screen.getByRole("button", { name: "Drive" });
    expect([num(drive, "width"), num(drive, "height")]).toEqual([button.width * 2, button.height * 0.5]);
  });

  it("keeps selector and dependent switches at the default size", () => {
    renderPanel(scaledLayout(2));
    for (const name of ["Shift", "Dependent"]) {
      const control = screen.getByRole("button", { name });
      expect([num(control, "width"), num(control, "height")]).toEqual([button.width, button.height]);
    }
  });
});

describe("category scale in the editor", () => {
  function renderEditor(scale?: CategoryScale) {
    const layout = scaledLayout(scale);
    render(
      <I18nProvider locale="en">
        <SynthLayoutEditor
          source={{ slug: "scaled", displayName: "Scaled", manufacturer: null, revision: 1, panelUrl: "/x.png", layout }}
          onSaved={vi.fn()}
          onClose={vi.fn()}
          onDeleted={vi.fn()}
        />
      </I18nProvider>,
    );
  }
  const cutoffRadius = () => num(document.querySelector('[data-layout-element-id="Cutoff"]')!, "r");

  it("scales proportionally by default and applies valid factors right away", async () => {
    const user = userEvent.setup();
    renderEditor();
    expect(screen.getByRole("switch", { name: "Scale “Filter” proportionally" })).toBeChecked();
    const field = screen.getByRole("spinbutton", { name: "Scale of “Filter”" });
    expect(field).toHaveValue(1);
    await user.clear(field);
    await user.type(field, "1.5");
    expect(cutoffRadius()).toBe(knob.hitRadius * 1.5);
    // Outside the limits nothing changes, and leaving the field shows the last valid factor.
    await user.clear(field);
    await user.type(field, "9");
    expect(cutoffRadius()).toBe(knob.hitRadius * 1.5);
    fireEvent.blur(field);
    expect(field).toHaveValue(1.5);
    expect(screen.getByText("Changes not saved yet – no new revision has been created.")).toBeInTheDocument();
  });

  it("offers separate factors for width and height when not proportional", async () => {
    const user = userEvent.setup();
    renderEditor(1.5);
    await user.click(screen.getByRole("switch", { name: "Scale “Filter” proportionally" }));
    const width = screen.getByRole("spinbutton", { name: "Width scale of “Filter”" });
    const height = screen.getByRole("spinbutton", { name: "Height scale of “Filter”" });
    expect([width, height].map((field) => (field as HTMLInputElement).value)).toEqual(["1.5", "1.5"]);
    await user.clear(height);
    await user.type(height, "0.5");
    // Round controls follow the smaller factor.
    expect(cutoffRadius()).toBe(knob.hitRadius * 0.5);
    await user.click(screen.getByRole("switch", { name: "Scale “Filter” proportionally" }));
    expect(screen.getByRole("spinbutton", { name: "Scale of “Filter”" })).toHaveValue(1.5);
  });
});
