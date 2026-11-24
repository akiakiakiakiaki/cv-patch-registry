import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SynthLayoutEditor } from "@/components/synth-editor/SynthLayoutEditor";
import { I18nProvider } from "@/i18n/provider";
import { testLayout } from "../fixtures/instrument";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, revision: 2 }), { status: 201 })));
});

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

const undo = (target: Element = document.body, meta = false) => fireEvent.keyDown(target, { key: "z", ctrlKey: !meta, metaKey: meta });
const redo = (target: Element = document.body) => fireEvent.keyDown(target, { key: "Z", ctrlKey: true, shiftKey: true });
const listed = (name: RegExp) => screen.queryByRole("button", { name });

describe("SynthLayoutEditor undo and redo", () => {
  it("undoes and redoes adding a control", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Add Knob" }));
    expect(listed(/Knob 1 · Knob/)).toBeInTheDocument();
    undo();
    expect(screen.queryByRole("button", { name: "Knobs (2)" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Knobs (1)" })).toBeInTheDocument();
    redo();
    expect(screen.getByRole("button", { name: "Knobs (2)" })).toBeInTheDocument();
  });

  it("undoes a series of arrow-key moves of one control as one step, also with Cmd", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Knobs (1)" }));
    await user.click(screen.getByRole("button", { name: /Test knob · Knob/ }));
    const x = () => (screen.getByRole("spinbutton", { name: "X" }) as HTMLInputElement).value;
    const start = x();
    const knob = screen.getByRole("button", { name: "Test knob" });
    for (let index = 0; index < 4; index += 1) fireEvent.keyDown(knob, { key: "ArrowRight" });
    expect(x()).not.toBe(start);
    undo(document.body, true);
    expect(x()).toBe(start);
  });

  it("undoes deleting a control", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Knobs (1)" }));
    await user.click(within(screen.getByRole("complementary")).getAllByRole("button", { name: "Remove Test knob" })[0]!);
    expect(screen.queryByRole("button", { name: /^Knobs/ })).not.toBeInTheDocument();
    undo();
    expect(screen.getByRole("button", { name: "Knobs (1)" })).toBeInTheDocument();
  });

  it("undoes a typed label as one step, but leaves text fields their own undo", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Knobs (1)" }));
    await user.click(screen.getByRole("button", { name: /Test knob · Knob/ }));
    const label = screen.getByRole("textbox", { name: "Label" });
    await user.clear(label);
    await user.type(label, "Cutoff");
    undo(label);
    expect(label).toHaveValue("Cutoff");
    undo();
    expect(screen.getByRole("textbox", { name: "Label" })).toHaveValue("Test knob");
  });

  it("does nothing while a dialog is open", async () => {
    const user = userEvent.setup();
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Add Knob" }));
    await user.click(screen.getAllByRole("button", { name: "Done" })[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Changes not saved" });
    undo(dialog);
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("button", { name: "Knobs (2)" })).toBeInTheDocument();
  });

  it("starts a new history after a category is removed", async () => {
    const user = userEvent.setup();
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Add Knob" }));
    await user.click(screen.getByRole("button", { name: "Add category" }));
    await user.click(screen.getByRole("button", { name: "Remove Category 1" }));
    undo();
    expect(screen.getByRole("button", { name: "Knobs (2)" })).toBeInTheDocument();
  });
});
