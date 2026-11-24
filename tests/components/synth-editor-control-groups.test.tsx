import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { SynthLayoutEditor } from "@/components/synth-editor/SynthLayoutEditor";
import { I18nProvider } from "@/i18n/provider";
import { testLayout } from "../fixtures/instrument";

function renderEditor(layout = testLayout) {
  return render(
    <I18nProvider locale="en">
      <SynthLayoutEditor
        source={{ slug: "test-synth", displayName: "Test Synth", manufacturer: null, revision: 1, panelUrl: "/assets/uploads/0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f.png", layout }}
        onSaved={vi.fn()}
        onClose={vi.fn()}
        onDeleted={vi.fn()}
      />
    </I18nProvider>,
  );
}

describe("SynthLayoutEditor control groups", () => {
  it("groups controls by kind with their count, starts collapsed and hides empty kinds", () => {
    renderEditor();
    for (const name of ["Knobs (1)", "Switches (1)", "LEDs (1)", "Inputs (2)", "Outputs (2)"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-expanded", "false");
    }
    expect(screen.queryByRole("button", { name: /^Uni ports/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Test knob · Knob/ })).not.toBeInTheDocument();
  });

  it("opens and closes a group", async () => {
    const user = userEvent.setup();
    renderEditor();
    const knobs = screen.getByRole("button", { name: "Knobs (1)" });
    await user.click(knobs);
    expect(knobs).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Test knob · Knob/ })).toBeInTheDocument();
    await user.click(knobs);
    expect(knobs).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the group of a control selected on the panel", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Test switch" }));
    expect(screen.getByRole("button", { name: "Switches (1)" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Test switch · Switch/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Knobs (1)" })).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the group of a control added from the palette", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Add Uni" }));
    expect(screen.getByRole("button", { name: "Uni ports (1)" })).toHaveAttribute("aria-expanded", "true");
  });

  it("has no axe violations with groups open and closed", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();
    await user.click(screen.getByRole("button", { name: "Knobs (1)" }));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("SynthLayoutEditor fixed LED colors", () => {
  it("offers red and blue only and shows a stored amber LED as blue", async () => {
    const user = userEvent.setup();
    renderEditor({ ...testLayout, leds: [{ id: "Test LED", x: 300, y: 100, color: "amber" }] });
    await user.click(screen.getByRole("button", { name: "LEDs (1)" }));
    await user.click(screen.getByRole("button", { name: /Test LED · LED/ }));
    const colour = screen.getByRole("combobox", { name: "Colour" });
    expect(colour).toHaveTextContent("Blue");
    await user.click(colour);
    expect(within(screen.getByRole("listbox")).getAllByRole("option").map((option) => option.textContent)).toEqual(["Red", "Blue"]);
  });
});
