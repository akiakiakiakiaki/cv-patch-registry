import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PatchManager } from "@/components/patch-manager/PatchManager";
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
    instruments: [behringerProton],
    instrumentId: behringerProton.id,
    onInstrumentChange: vi.fn(),
    patches,
    activeId: "active",
    activeName: "Active patch",
    status: "Saved",
    onNameChange: vi.fn(),
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

describe("PatchManager", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

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

  it("keeps language and color mode switches in a padded fixed viewport container", () => {
    renderManager();

    const container = screen.getByTestId("preference-switches-container");
    expect(getComputedStyle(container).position).toBe("fixed");
    expect(screen.getByRole("group", { name: "Language" })).toBeInTheDocument();
    expect(screen.getByTestId("patch-actions")).not.toContainElement(container);
  });

  it("creates, selects, renames, and deletes patches through callbacks", async () => {
    const user = userEvent.setup();
    const { props } = renderManager();
    await user.click(screen.getByRole("button", { name: /New patch/ }));
    expect(props.onCreate).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: /^Active patch/ }));
    expect(props.onSelect).toHaveBeenCalledWith("active");

    vi.spyOn(window, "prompt").mockReturnValue("  Renamed patch  ");
    await user.click(screen.getByRole("button", { name: "Rename patch “Active patch”" }));
    expect(props.onRename).toHaveBeenCalledWith("active", "Renamed patch");

    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Delete patch “Active patch”" }));
    expect(props.onDelete).toHaveBeenCalledWith("active");
  });

  it("does not rename or delete when the user cancels", async () => {
    const user = userEvent.setup();
    const { props } = renderManager();
    await user.click(screen.getByRole("button", { name: /^Patches/ }));
    vi.spyOn(window, "prompt").mockReturnValue(null);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    await user.click(screen.getByRole("button", { name: "Rename patch “Active patch”" }));
    await user.click(screen.getByRole("button", { name: "Delete patch “Active patch”" }));

    expect(props.onRename).not.toHaveBeenCalled();
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it("triggers export and imports the selected JSON file", async () => {
    const user = userEvent.setup();
    const { container, props } = renderManager();
    await user.click(screen.getByRole("button", { name: "Download all patches" }));
    expect(props.onExport).toHaveBeenCalledOnce();

    const file = new File(["{}"], "patches.json", { type: "application/json" });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [file] } });
    await waitFor(() => expect(props.onImport).toHaveBeenCalledWith(file));
    expect(screen.getByRole("button", { name: /^Patches/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("switches language and saves the override in localStorage", async () => {
    const user = userEvent.setup();
    renderManager();
    await user.click(screen.getByRole("button", { name: "DE" }));

    expect(await screen.findByLabelText("Sprache")).toBeInTheDocument();
    await waitFor(() =>
      expect(window.localStorage.getItem("synth-patch-sheet-locale")).toBe("de"),
    );
    expect(screen.getByRole("button", { name: "DE" })).toHaveAttribute("aria-pressed", "true");
  });
});
