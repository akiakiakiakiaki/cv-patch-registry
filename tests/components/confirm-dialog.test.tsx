import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog, useConfirmDialog, type ConfirmOptions } from "@/components/confirm-dialog/ConfirmDialog";
import { I18nProvider } from "@/i18n/provider";

describe("ConfirmDialog", () => {
  it("shows title and content, with cancel focused and default labels", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <I18nProvider locale="en">
        <ConfirmDialog open title="Delete it?" content="This cannot be undone." tone="danger" onConfirm={onConfirm} onCancel={onCancel} />
      </I18nProvider>,
    );
    const dialog = screen.getByRole("dialog", { name: "Delete it?" });
    expect(dialog).toHaveAccessibleDescription("This cannot be undone.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
    await userEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});

function Harness({ options, onResult }: { options: ConfirmOptions; onResult: (value: boolean) => void }) {
  const { confirm, dialog } = useConfirmDialog();
  return (
    <>
      <button onClick={() => void confirm(options).then(onResult)}>ask</button>
      {dialog}
    </>
  );
}

describe("useConfirmDialog", () => {
  it.each([
    ["Save anyway", true],
    ["Keep editing", false],
  ])("resolves the promise when %s is chosen", async (label, expected) => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(
      <I18nProvider locale="en">
        <Harness options={{ title: "Sure?", content: "Details", confirmLabel: "Save anyway", cancelLabel: "Keep editing" }} onResult={onResult} />
      </I18nProvider>,
    );
    await user.click(screen.getByRole("button", { name: "ask" }));
    await user.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(expected));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("reports the alternative action through choose()", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    function ChooseHarness() {
      const { choose, dialog } = useConfirmDialog();
      return (
        <>
          <button onClick={() => void choose({ title: "Changed", content: "Details", alternativeLabel: "Restore" }).then(onResult)}>ask</button>
          {dialog}
        </>
      );
    }
    render(
      <I18nProvider locale="en">
        <ChooseHarness />
      </I18nProvider>,
    );
    await user.click(screen.getByRole("button", { name: "ask" }));
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(expect.arrayContaining(["Restore", "Cancel", "OK"]));
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith("alternative"));
  });

  it("treats Escape as cancel", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(
      <I18nProvider locale="en">
        <Harness options={{ title: "Sure?", content: "Details" }} onResult={onResult} />
      </I18nProvider>,
    );
    await user.click(screen.getByRole("button", { name: "ask" }));
    await act(async () => {
      await user.keyboard("{Escape}");
    });
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });
});

function PromptHarness({ onResult }: { onResult: (value: string | null) => void }) {
  const { prompt, dialog } = useConfirmDialog();
  return (
    <>
      <button onClick={() => void prompt({ title: "Rename", content: null, label: "Name", initialValue: "Old", emptyHint: "Required" }).then(onResult)}>
        ask
      </button>
      {dialog}
    </>
  );
}

describe("useConfirmDialog prompt", () => {
  it("resolves the trimmed text, focuses the field and blocks blank input", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(
      <I18nProvider locale="en">
        <PromptHarness onResult={onResult} />
      </I18nProvider>,
    );
    await user.click(screen.getByRole("button", { name: "ask" }));
    const field = await screen.findByRole("textbox", { name: "Name" });
    await waitFor(() => expect(field).toHaveFocus());
    await user.clear(field);
    expect(screen.getByRole("button", { name: "OK" })).toBeDisabled();
    expect(screen.getByText("Required")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(onResult).not.toHaveBeenCalled();
    await user.type(field, "  New  ");
    await user.click(screen.getByRole("button", { name: "OK" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith("New"));
  });

  it("resolves null on cancel and starts the next request with its own initial value", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(
      <I18nProvider locale="en">
        <PromptHarness onResult={onResult} />
      </I18nProvider>,
    );
    await user.click(screen.getByRole("button", { name: "ask" }));
    await user.type(await screen.findByRole("textbox", { name: "Name" }), " typed");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(null));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "ask" }));
    expect(await screen.findByRole("textbox", { name: "Name" })).toHaveValue("Old");
  });
});
