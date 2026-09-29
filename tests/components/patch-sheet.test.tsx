import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PatchSheet } from "@/components/patch-sheet/PatchSheet";
import { I18nProvider } from "@/i18n/provider";
import { encodeLibrary } from "@/lib/adapters/patch-adapter";
import type { PatchLibrary, PatchRecord } from "@/lib/domain/types";
import { LocalPatchRepository } from "@/lib/storage/local-patch-repository";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import type { InstrumentDefinition } from "@/lib/instruments/types";

vi.mock("@/hooks/use-instrument-layout-editor", () => ({
  useInstrumentLayoutEditor: (instrument: InstrumentDefinition) => ({
    layout: instrument.layout,
    focusedElement: null,
    dirty: false,
    saving: false,
    message: "",
    focus: vi.fn(),
    clearFocus: vi.fn(),
    moveFocused: vi.fn(),
    save: vi.fn(),
  }),
}));

const initialPatch: PatchRecord = {
  id: "patch-shared",
  name: "Local version",
  updatedAt: "2026-01-01T00:00:00.000Z",
  data: { knobs: { "Tune 1": 50 }, switches: {}, leds: {}, cables: [] },
};
const initialLibrary: PatchLibrary = {
  activeId: initialPatch.id,
  patches: [initialPatch],
};

function renderSheet() {
  return render(
    <I18nProvider locale="en">
      <PatchSheet />
    </I18nProvider>,
  );
}

describe("PatchSheet", () => {
  const repository = new LocalPatchRepository(behringerProton);

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("immediately saves control changes to the current synth's local library", async () => {
    repository.save(initialLibrary);
    renderSheet();

    fireEvent.keyDown(await screen.findByRole("slider", { name: "Tune 1" }), {
      key: "ArrowRight",
    });

    await waitFor(() => {
      expect(repository.load().patches[0]?.data.knobs["Tune 1"]).toBe(65);
    });
  });

  it("merges imported patches and keeps the local version when a conflict is declined", async () => {
    repository.save(initialLibrary);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderSheet();

    const incomingConflict: PatchRecord = {
      ...initialPatch,
      name: "Imported version",
      updatedAt: "2027-01-01T00:00:00.000Z",
      data: { ...initialPatch.data, knobs: { "Tune 1": 90 } },
    };
    const incomingNew: PatchRecord = {
      ...incomingConflict,
      id: "patch-new",
      name: "New imported patch",
    };
    const bundle = encodeLibrary(
      { activeId: initialPatch.id, patches: [incomingConflict, incomingNew] },
      behringerProton.id,
      "2027-01-01T00:00:00.000Z",
    );
    const file = new File([JSON.stringify(bundle)], "patches.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", {
      value: vi.fn().mockResolvedValue(JSON.stringify(bundle)),
    });
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => expect(window.confirm).toHaveBeenCalledOnce());
    await waitFor(() => {
      const merged = repository.load();
      expect(merged.patches).toHaveLength(2);
      expect(merged.patches.find((patch) => patch.id === initialPatch.id)?.name).toBe(
        "Local version",
      );
      expect(merged.patches.find((patch) => patch.id === "patch-new")?.name).toBe(
        "New imported patch",
      );
    });
  });
});
