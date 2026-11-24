import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InstrumentPanel } from "@/components/instrument-panel/InstrumentPanel";
import { I18nProvider } from "@/i18n/provider";
import { categoryStateKey } from "@/lib/domain/switch-categories";
import type { PatchData } from "@/lib/domain/types";
import { instrumentFromSynth } from "@/lib/instruments/from-synth";
import { DEPENDENT, KNOB, NORMAL, PLAIN, SELECTOR, SHIFT, THIRD, categoryLayout } from "../fixtures/categories";

const instrument = instrumentFromSynth({ slug: "test-synth", displayName: "Test Synth", panelUrl: "/x.png", layout: categoryLayout });

function renderPanel(switches: PatchData["switches"] = {}) {
  const onSwitchChange = vi.fn();
  const view = render(
    <I18nProvider locale="en">
      <InstrumentPanel
        data={{ knobs: {}, switches, leds: {}, cables: [] }}
        instrument={instrument}
        layout={categoryLayout}
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
    </I18nProvider>,
  );
  return { ...view, onSwitchChange };
}

describe("InstrumentPanel with color categories", () => {
  it("defines each category color once, scoped to this panel", () => {
    const { container } = renderPanel();
    const svg = container.querySelector("svg[data-category-scope]")!;
    const scope = svg.getAttribute("data-category-scope");
    const css = svg.querySelector("style")?.textContent ?? "";
    expect(css).toContain(`[data-category-scope="${scope}"] .${SHIFT}{--category-color:#1e88e5}`);
    expect(css.split("\n")).toHaveLength(3);
  });

  it("gives controls only the class of their category", () => {
    const { container } = renderPanel();
    const tick = container.querySelector(`line.${SHIFT}`);
    expect(tick).not.toBeNull();
    expect(screen.getByRole("button", { name: PLAIN })).toHaveClass(THIRD);
    expect(screen.getByRole("button", { name: SELECTOR })).toHaveClass(NORMAL);
    expect(container.querySelector(`[style*="--category-color"]`)).toBeNull();
    expect(screen.getByRole("slider", { name: KNOB })).toBeInTheDocument();
  });

  it("shows dependents in the selector's active category with that category's state", () => {
    renderPanel({ [categoryStateKey(SELECTOR, SHIFT)]: true, [categoryStateKey(DEPENDENT, SHIFT)]: true });
    const dependent = screen.getByRole("button", { name: DEPENDENT });
    expect(dependent).toHaveClass(SHIFT);
    expect(dependent).toHaveAttribute("aria-pressed", "true");
  });

  it("reports every key a selector click changes in one call", () => {
    const { onSwitchChange } = renderPanel({ [categoryStateKey(SELECTOR, SHIFT)]: true });
    fireEvent.click(screen.getByRole("button", { name: SELECTOR }));
    expect(onSwitchChange).toHaveBeenCalledTimes(1);
    expect(onSwitchChange).toHaveBeenCalledWith({
      [categoryStateKey(SELECTOR, NORMAL)]: false,
      [categoryStateKey(SELECTOR, SHIFT)]: false,
      [categoryStateKey(SELECTOR, THIRD)]: true,
    });
  });
});

describe("InstrumentPanel LEDs with a category", () => {
  const layout = { ...categoryLayout, leds: [{ id: "led-00000001", x: 500, y: 100, color: "red" as const, category: THIRD }, { id: "led-00000002", x: 600, y: 100, color: "red" as const }] };
  const ledInstrument = instrumentFromSynth({ slug: "test-synth", displayName: "Test Synth", panelUrl: "/x.png", layout });

  it("use the category class instead of their fixed color, lit or not", () => {
    render(
      <I18nProvider locale="en">
        <InstrumentPanel
          data={{ knobs: {}, switches: {}, leds: { "led-00000001": true }, cables: [] }}
          instrument={ledInstrument}
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
    const categorized = screen.getByRole("checkbox", { name: "led-00000001" });
    expect(categorized).toHaveClass(THIRD);
    expect(categorized.getAttribute("class")).toMatch(/ledCategoryActive/);
    expect(categorized.getAttribute("class")).not.toMatch(/ledRed/);
    expect(screen.getByRole("checkbox", { name: "led-00000002" }).getAttribute("class")).toMatch(/ledRed/);
  });
});
