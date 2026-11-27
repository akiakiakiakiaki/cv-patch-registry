import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SynthLayoutEditor } from "@/components/synth-editor/SynthLayoutEditor";
import { I18nProvider } from "@/i18n/provider";
import { testLayout } from "../fixtures/instrument";
import { addCategory } from "../helpers/categories";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, revision: 2 }), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
});

function renderEditor() {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <I18nProvider locale="en">
      <SynthLayoutEditor
        source={{ slug: "test-synth", displayName: "Test Synth", manufacturer: null, revision: 1, panelUrl: "/assets/uploads/0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f.png", layout: testLayout }}
        onSaved={onSaved}
        onClose={onClose}
        onDeleted={vi.fn()}
      />
    </I18nProvider>,
  );
  return { onClose, onSaved };
}

const HINT = "Changes not saved yet – no new revision has been created.";

async function changeAndClickDone(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.click(screen.getByRole("button", { name: "Add Knob" }));
  await user.click(screen.getByRole("button", { name: "Done" }));
  return screen.findByRole("dialog", { name: "Changes not saved" });
}

describe("SynthLayoutEditor closing", () => {
  it("closes at once without unsaved changes", async () => {
    const user = userEvent.setup();
    const { onClose } = renderEditor();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a hint while changes are unsaved, until they are saved", async () => {
    const user = userEvent.setup();
    renderEditor();
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Knob" }));
    expect(screen.getByText(HINT)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByText(HINT)).not.toBeInTheDocument());
  });

  it("asks with save, discard and keep editing; keep editing stays in the editor", async () => {
    const user = userEvent.setup();
    const { onClose } = renderEditor();
    const dialog = await changeAndClickDone(user);
    for (const name of ["Save and close", "Discard", "Keep editing"]) expect(within(dialog).getByRole("button", { name })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("discards the changes and closes without saving", async () => {
    const user = userEvent.setup();
    const { onClose } = renderEditor();
    await user.click(within(await changeAndClickDone(user)).getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves a new revision and closes", async () => {
    const user = userEvent.setup();
    const { onClose, onSaved } = renderEditor();
    await user.click(within(await changeAndClickDone(user)).getByRole("button", { name: "Save and close" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/synths/test-synth/revisions", expect.objectContaining({ method: "POST" }));
  });

  it("stays open with the error when saving fails", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "conflict" }), { status: 409 }));
    const { onClose } = renderEditor();
    await user.click(within(await changeAndClickDone(user)).getByRole("button", { name: "Save and close" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("changed in the meantime");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("goes through the correction dialog when categories do not fit, and closes only after saving", async () => {
    const user = userEvent.setup();
    const { onClose } = renderEditor();
    await addCategory(user);
    await addCategory(user);
    await user.click(screen.getByRole("button", { name: "Switches (1)" }));
    await user.click(screen.getByRole("button", { name: /Test switch · Switch/ }));
    await user.click(screen.getByRole("combobox", { name: "Function" }));
    await user.click(await screen.findByRole("option", { name: "Selector switch" }));
    await user.click(screen.getByRole("button", { name: "Remove Category 2 from the selector" }));

    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Changes not saved" })).getByRole("button", { name: "Save and close" }));
    const issues = await screen.findByRole("dialog", { name: "Categories and switches do not fit together" });
    await user.click(within(issues).getByRole("button", { name: "Back to the editor" }));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Changes not saved" })).getByRole("button", { name: "Save and close" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Categories and switches do not fit together" })).getByRole("button", { name: "Fix and save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe("SynthLayoutEditor save block", () => {
  it("puts saving and the unsaved hint at the top of the sidebar, before palette, categories and controls", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Add Knob" }));
    const block = screen.getByTestId("synth-editor-save");
    expect(within(block).getByRole("button", { name: "Save" })).toBeEnabled();
    expect(within(block).getByText(HINT)).toBeInTheDocument();
    for (const later of [screen.getByRole("button", { name: "Add Knob" }), screen.getByRole("button", { name: "Add category" }), screen.getByRole("button", { name: /^Knobs/ })]) {
      expect(block.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const heading = screen.getByRole("heading", { name: "Edit synthesizer" });
    expect(heading.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

