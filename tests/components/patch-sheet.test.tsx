import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PatchSheet } from "@/components/patch-sheet/PatchSheet";
import { I18nProvider } from "@/i18n/provider";
import type { PatchLibrary, PatchRecord } from "@/lib/domain/types";
import { LocalPatchRepository } from "@/lib/storage/local-patch-repository";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import type { InstrumentDefinition } from "@/lib/instruments/types";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// Anonymous visitor: patches stay in this browser.
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: () => ({ data: null, isPending: false }),
    signOut: vi.fn(),
  },
}));

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
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ synths: [] }), { status: 200 })));
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

  it("keeps patch import controls hidden for a guest", async () => {
    repository.save(initialLibrary);
    renderSheet();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Download all patches" })).not.toBeInTheDocument();
  });
});
