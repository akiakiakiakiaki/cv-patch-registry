import Button from "@mui/material/Button";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/components/app-providers/AppProviders";
import { AppFooter } from "@/components/app-shell/AppFooter";
import { BAR_CONTROL_HEIGHT, PatchManager } from "@/components/patch-manager/PatchManager";
import { I18nProvider } from "@/i18n/provider";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import type { PatchRecord } from "@/lib/domain/types";

const patches: PatchRecord[] = [
  {
    id: "older",
    name: "Older patch",
    updatedAt: "2026-01-01T00:00:00.000Z",
    data: { knobs: {}, switches: {}, leds: {}, cables: [] },
  },
  {
    id: "active",
    name: "Active patch",
    updatedAt: "2026-02-01T00:00:00.000Z",
    data: { knobs: {}, switches: {}, leds: {}, cables: [] },
  },
];

function renderManager(overrides: Partial<ComponentProps<typeof PatchManager>> = {}) {
  const props: ComponentProps<typeof PatchManager> = {
    role: "user",
    instruments: [{ id: behringerProton.id, displayName: behringerProton.displayName }],
    onCreateSynth: vi.fn(),
    instrumentId: behringerProton.id,
    onInstrumentChange: vi.fn(),
    patches,
    activeId: "active",
    status: "Saved",
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
    ...overrides,
  };
  const result = render(
    <I18nProvider locale="en">
      <PatchManager {...props} />
    </I18nProvider>,
  );
  return { ...result, props };
}

// A test below switches the language and stores it; every test starts in English again.
beforeEach(() => {
  window.localStorage.clear();
});

describe("PatchManager", () => {

  it("shows the registered synth and routes its selection", async () => {
    const user = userEvent.setup();
    const otherInstrument = { ...behringerProton, id: "other-synth", displayName: "Other Synth" };
    const { props } = renderManager({
      instruments: [behringerProton, otherInstrument],
      instrumentId: otherInstrument.id,
    });
    await user.click(screen.getByRole("combobox", { name: "Synthesizer" }));
    const protonOption = await screen.findByRole("option", { name: "Behringer Proton" });
    expect(protonOption).toBeInTheDocument();
    await user.click(protonOption);
    expect(props.onInstrumentChange).toHaveBeenCalledWith(behringerProton.id);
  });

  it("pushes patch actions to the end of their flex row", () => {
    renderManager();

    expect(getComputedStyle(screen.getByTestId("patch-actions")).marginLeft).toBe("auto");
  });

  it("leaves language and color mode controls to the shared app shell", () => {
    renderManager();

    expect(screen.queryByTestId("preference-switches-container")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Language" })).not.toBeInTheDocument();
  });

  it("creates, selects, renames, and deletes patches through callbacks", async () => {
    const user = userEvent.setup();
    const { props } = renderManager();
    await user.click(screen.getByRole("button", { name: /New patch/ }));
    expect(props.onCreate).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Patches" }));
    const list = await screen.findByRole("dialog", { name: "Patches" });
    // Newest first, the active patch marked.
    const cards = within(list).getAllByRole("button", { name: /patch.*Last changed/ });
    expect(cards.map((card) => card.textContent)).toEqual([expect.stringContaining("Active patch"), expect.stringContaining("Older patch")]);
    expect(cards[0]).toHaveAttribute("aria-current", "true");
    await user.click(cards[0]!);
    expect(props.onSelect).toHaveBeenCalledWith("active");
    // Opening a patch closes the list.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Patches" }));

    await user.click(screen.getByRole("button", { name: "Rename patch “Active patch”" }));
    const renameDialog = await screen.findByRole("dialog", { name: "Rename patch" });
    const nameField = within(renameDialog).getByRole("textbox", { name: "New patch name" });
    expect(nameField).toHaveValue("Active patch");
    await user.clear(nameField);
    // A blank name cannot be confirmed.
    expect(within(renameDialog).getByRole("button", { name: "Rename" })).toBeDisabled();
    expect(within(renameDialog).getByText("The patch name cannot be empty.")).toBeInTheDocument();
    await user.type(nameField, "  Renamed patch  {Enter}");
    expect(props.onRename).toHaveBeenCalledWith("active", "Renamed patch");
    // The question closes; the list stays open below it.
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Rename patch" })).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "Patches" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete patch “Active patch”" }));
    const deleteDialog = await screen.findByRole("dialog", { name: "Delete patch" });
    expect(deleteDialog).toHaveTextContent("Delete patch “Active patch”?");
    await user.click(within(deleteDialog).getByRole("button", { name: "Delete" }));
    expect(props.onDelete).toHaveBeenCalledWith("active");
  });

  it("does not rename or delete when the user cancels", async () => {
    const user = userEvent.setup();
    const { props } = renderManager();
    await user.click(screen.getByRole("button", { name: "Patches" }));

    await user.click(screen.getByRole("button", { name: "Rename patch “Active patch”" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Rename patch" })).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Rename patch" })).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Delete patch “Active patch”" }));
    await screen.findByRole("dialog", { name: "Delete patch" });
    // Escape answers only the question; the list stays open.
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Delete patch" })).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "Patches" })).toBeInTheDocument();

    expect(props.onRename).not.toHaveBeenCalled();
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it("triggers export and imports the selected JSON file", async () => {
    const user = userEvent.setup();
    const { props } = renderManager();
    // Download and import live in the patch list, not in the bar.
    expect(screen.queryByRole("button", { name: "Download all patches" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Patches" }));
    const list = await screen.findByRole("dialog", { name: "Patches" });
    await user.click(within(list).getByRole("button", { name: "Download all patches" }));
    expect(props.onExport).toHaveBeenCalledOnce();

    const file = new File(["{}"], "patches.json", { type: "application/json" });
    const input = list.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [file] } });
    await waitFor(() => expect(props.onImport).toHaveBeenCalledWith(file));
  });

  it("switches language in the shared footer and saves the override in localStorage", async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <I18nProvider locale="en">
          <AppFooter />
        </I18nProvider>
      </AppProviders>,
    );
    await user.click(screen.getByRole("button", { name: "DE" }));

    expect(await screen.findByLabelText("Sprache")).toBeInTheDocument();
    await waitFor(() =>
      expect(window.localStorage.getItem("synth-patch-sheet-locale")).toBe("de"),
    );
    expect(screen.getByRole("button", { name: "DE" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("shared footer in development mode", () => {
  function renderFooter(developmentMode?: boolean) {
    return render(
      <AppProviders>
        <I18nProvider locale="en">
          <AppFooter developmentMode={developmentMode} />
        </I18nProvider>
      </AppProviders>,
    );
  }

  it("says so next to the title when DEVELOPMENT is on", () => {
    renderFooter(true);
    expect(screen.getByText("Development mode · dev database")).toBeInTheDocument();
  });

  it("says nothing about it otherwise", () => {
    renderFooter();
    expect(screen.queryByText(/Development mode/)).not.toBeInTheDocument();
  });
});

describe("PatchManager synth action", () => {
  it("shows the given action right of the synth selector", () => {
    renderManager({ synthAction: <button type="button">Edit</button> });
    const selector = screen.getByRole("combobox", { name: "Synthesizer" });
    const action = screen.getByRole("button", { name: "Edit" });
    expect(selector.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Active patch name" })).not.toBeInTheDocument();
  });
});

describe("PatchManager bar height", () => {
  it("gives every button of the bar the height of the synth selector", () => {
    renderManager({ synthAction: <Button variant="outlined">Edit</Button> });
    const bar = screen.getByRole("combobox", { name: "Synthesizer" }).closest("section")!;
    const buttons = within(bar).getAllByRole("button").filter((button) => button.classList.contains("MuiButton-root"));
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    for (const button of buttons) expect(getComputedStyle(button).height).toBe(`${BAR_CONTROL_HEIGHT}px`);
  });
});

describe("PatchManager patch list", () => {
  it("opens as a dialog over the page and closes with its close button", async () => {
    const user = userEvent.setup();
    renderManager({ status: "Saved" });
    const open = screen.getByRole("button", { name: "Patches" });
    expect(open).toHaveAttribute("aria-haspopup", "dialog");
    await user.click(open);
    const list = await screen.findByRole("dialog", { name: "Patches" });
    expect(list).toHaveTextContent("2 patches · Saved");
    await user.click(within(list).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("creates a patch from the list and closes it", async () => {
    const user = userEvent.setup();
    const { props } = renderManager();
    await user.click(screen.getByRole("button", { name: "Patches" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Patches" })).getByRole("button", { name: "+ New patch" }));
    expect(props.onCreate).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("is not offered while patch actions are hidden", () => {
    renderManager({ showPatchActions: false });
    expect(screen.queryByRole("button", { name: "Patches" })).not.toBeInTheDocument();
  });
});

describe("PatchManager patch list for guests", () => {
  it("offers no download or import", async () => {
    const user = userEvent.setup();
    renderManager({ role: "guest" });
    await user.click(screen.getByRole("button", { name: "Patches" }));
    const list = await screen.findByRole("dialog", { name: "Patches" });
    expect(within(list).queryByRole("button", { name: "Download all patches" })).not.toBeInTheDocument();
    expect(within(list).queryByRole("button", { name: "Import patches" })).not.toBeInTheDocument();
  });
});

