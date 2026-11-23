import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PatchSheet } from "@/components/patch-sheet/PatchSheet";
import { I18nProvider } from "@/i18n/provider";
import type { InstrumentLayout } from "@/lib/instrument/layout";
import { testLayout } from "../fixtures/instrument";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("synth=custom-synth"),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "user-1", role: "user" } }, isPending: false }), signOut: vi.fn() },
}));

const PATCH_ID = "11111111-1111-4111-8111-111111111111";
// Revision 1 had a second knob that revision 2 removed.
const oldLayout: InstrumentLayout = { ...testLayout, knobs: [...testLayout.knobs, { id: "Old knob", label: "Old knob", x: 500, y: 100 }] };
const loss = { kind: "knob", id: "Old knob", label: "Old knob", value: 42 };
const data = { knobs: { "Test knob": 10, "Old knob": 42 }, switches: {}, leds: {}, cables: [] };

const synthView = {
  slug: "custom-synth",
  displayName: "Custom Synth",
  manufacturer: null,
  revision: 2,
  isBuiltIn: false,
  ownerId: "user-1",
  layout: testLayout,
  panelUrl: "/assets/uploads/new.png",
};
const patchState = {
  id: PATCH_ID,
  name: "Old Bass",
  updatedAt: "2026-01-01T00:00:00.000Z",
  revision: 4,
  visibility: "private",
  tags: [],
  data,
  synthRevision: 1,
  revisionLosses: [loss],
};
const patchView = {
  id: PATCH_ID,
  name: "Old Bass",
  description: null,
  visibility: "private",
  revision: 4,
  ownerId: "user-1",
  isOwner: true,
  tags: [],
  updatedAt: patchState.updatedAt,
  synth: { slug: "custom-synth", displayName: "Custom Synth", panelUrl: "/assets/uploads/old.png", layout: oldLayout },
  data,
  sample: null,
};

let patchBodies: Record<string, unknown>[];

beforeEach(() => {
  window.localStorage.clear();
  patchBodies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      if (init?.method === "PATCH") {
        patchBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return json({ ok: true, revision: 5 });
      }
      if (url.startsWith("/api/synths/custom-synth")) return json(synthView);
      if (url.startsWith("/api/synths")) return json({ synths: [{ slug: "custom-synth", displayName: "Custom Synth", isBuiltIn: false }] });
      if (url.startsWith("/api/patches?")) return json({ patches: [patchState] });
      if (url.startsWith(`/api/patches/${PATCH_ID}`)) return json(patchView);
      return new Response("{}", { status: 404 });
    }),
  );
});

function renderSheet() {
  return render(
    <I18nProvider locale="en">
      <PatchSheet />
    </I18nProvider>,
  );
}

describe("PatchSheet with a patch on an outdated synth revision", () => {
  it("marks the revision as outdated and shows the patch with its own revision's controls", async () => {
    renderSheet();
    expect(await screen.findByText("This patch uses revision 1 of Custom Synth (outdated, current is revision 2).")).toBeInTheDocument();
    // The older revision has two knobs, the current one only one.
    await waitFor(() => expect(screen.getByText(/^2 knobs/)).toBeInTheDocument());
  });

  it("lists the settings that get lost and updates the patch only after confirmation", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(await screen.findByRole("button", { name: "Update" }));

    const dialog = await screen.findByRole("dialog", { name: "Update patch to revision 2?" });
    expect(within(dialog).getByText("Knob “Old knob”")).toBeInTheDocument();
    expect(within(dialog).getByText("value 42")).toBeInTheDocument();
    expect(patchBodies).toEqual([]);

    await user.click(within(dialog).getByRole("button", { name: "Update" }));
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]).toMatchObject({ acceptRevisionLoss: true, expectedRevision: 4 });
    expect(patchBodies[0]).not.toHaveProperty("keepRevision");
  });

  it("keeps the patch on its revision when the update is cancelled", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(await screen.findByRole("button", { name: "Update" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(patchBodies).toEqual([]);
    expect(screen.getByText(/outdated, current is revision 2/)).toBeInTheDocument();
  });
});

describe("PatchSheet save status for a signed-in user", () => {
  it("says the patch is saved to the account, not locally", async () => {
    renderSheet();
    expect(await screen.findByText("Saved to your account")).toBeInTheDocument();
    expect(screen.queryByText("Saved locally automatically")).not.toBeInTheDocument();
    expect(screen.getByText("Changes are saved to your account automatically.")).toBeInTheDocument();
  });
});
