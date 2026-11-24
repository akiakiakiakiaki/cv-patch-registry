import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { InstrumentPanel } from "@/components/instrument-panel/InstrumentPanel";
import { SynthLayoutEditor } from "@/components/synth-editor/SynthLayoutEditor";
import { I18nProvider } from "@/i18n/provider";
import { testInstrument, testLayout } from "../fixtures/instrument";

function renderEditor() {
  return render(
    <I18nProvider locale="en">
      <SynthLayoutEditor
        source={{ slug: "test-synth", displayName: "Test Synth", manufacturer: null, revision: 1, panelUrl: "/assets/uploads/0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f.png", layout: testLayout }}
        onSaved={vi.fn()}
        onClose={vi.fn()}
        onDeleted={vi.fn()}
      />
    </I18nProvider>,
  );
}

const zoomWidth = () => screen.getByTestId("synth-panel-zoom").style.width;

describe("SynthLayoutEditor panel zoom", () => {
  it("starts at full width and grows in 50 % steps up to 250 %", async () => {
    const user = userEvent.setup();
    renderEditor();
    const zoomIn = screen.getByRole("button", { name: "Zoom in on the panel" });
    const zoomOut = screen.getByRole("button", { name: "Zoom out of the panel" });
    const reset = screen.getByRole("button", { name: "Reset to full width" });
    expect(zoomWidth()).toBe("100%");
    expect(screen.getByText("100 %")).toBeInTheDocument();
    expect(zoomOut).toBeDisabled();
    expect(reset).toBeDisabled();

    for (const [percent, width] of [["150 %", "150%"], ["200 %", "200%"], ["250 %", "250%"]] as const) {
      await user.click(zoomIn);
      expect(screen.getByText(percent)).toBeInTheDocument();
      expect(zoomWidth()).toBe(width);
    }
    expect(zoomIn).toBeDisabled();

    await user.click(zoomOut);
    expect(zoomWidth()).toBe("200%");
  });

  it("goes straight back to full width", async () => {
    const user = userEvent.setup();
    renderEditor();
    const zoomIn = screen.getByRole("button", { name: "Zoom in on the panel" });
    await user.click(zoomIn);
    await user.click(zoomIn);
    await user.click(screen.getByRole("button", { name: "Reset to full width" }));
    expect(zoomWidth()).toBe("100%");
    expect(screen.getByRole("button", { name: "Zoom out of the panel" })).toBeDisabled();
  });

  it("sits above the panel instead of over it", () => {
    renderEditor();
    const bar = screen.getByRole("group", { name: "Panel size" });
    const viewport = screen.getByTestId("synth-panel-viewport");
    expect(viewport.contains(bar)).toBe(false);
    expect(bar.compareDocumentPosition(viewport) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("is grouped and labelled without axe violations", async () => {
    const { container } = renderEditor();
    expect(screen.getByRole("group", { name: "Panel size" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("is not offered on the panel outside the editor", () => {
    render(
      <I18nProvider locale="en">
        <InstrumentPanel
          data={{ knobs: {}, switches: {}, leds: {}, cables: [] }}
          instrument={testInstrument}
          layout={testLayout}
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
    expect(screen.queryByRole("group", { name: "Panel size" })).not.toBeInTheDocument();
  });
});
