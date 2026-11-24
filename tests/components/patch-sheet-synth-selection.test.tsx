import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PatchSheet } from "@/components/patch-sheet/PatchSheet";
import { I18nProvider } from "@/i18n/provider";
import { encodeLibrary } from "@/lib/adapters/patch-adapter";
import { PROTON_CLONE_SLUG, buildProtonCloneLayout, cloneControlId } from "@/lib/adapters/proton-legacy-migration-adapter";
import type { PatchLibrary } from "@/lib/domain/types";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import { instrumentFromSynth } from "@/lib/instruments/from-synth";
import { readLastSynth, writeLastSynth } from "@/lib/storage/last-synth";
import { LocalPatchRepository } from "@/lib/storage/local-patch-repository";
import { testLayout } from "../fixtures/instrument";

const navigation = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => navigation.params,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
const auth = vi.hoisted(() => ({ session: null as null | { user: { id: string; role: string } } }));
vi.mock("@/lib/auth/client", () => ({
  authClient: { useSession: () => ({ data: auth.session, isPending: false }), signOut: vi.fn() },
}));

const cloneLayout = buildProtonCloneLayout();
const views: Record<string, unknown> = {
  td3: { slug: "td3", displayName: "TD3", manufacturer: null, revision: 1, isBuiltIn: false, ownerId: "x", layout: { ...testLayout, id: "td3" }, panelUrl: "/assets/uploads/0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f.png" },
  [PROTON_CLONE_SLUG]: { slug: PROTON_CLONE_SLUG, displayName: "Behringer Proton", manufacturer: "Behringer", revision: 1, isBuiltIn: false, ownerId: "x", layout: cloneLayout, panelUrl: "/assets/uploads/1a2b3c4d-4b5a-4968-8778-6a5b4c3d2e1f.png" },
};
const catalog = {
  synths: [
    { slug: "td3", displayName: "TD3", isBuiltIn: false },
    { slug: PROTON_CLONE_SLUG, displayName: "Behringer Proton", isBuiltIn: false },
    { slug: behringerProton.id, displayName: "Behringer Proton", isBuiltIn: true },
  ],
};
const legacyLibrary: PatchLibrary = {
  activeId: "p1",
  patches: [{ id: "p1", name: "Legacy Bass", updatedAt: "2026-01-01T00:00:00.000Z", data: { knobs: { "Tune 1": 100 }, switches: {}, leds: {}, cables: [] } }],
};

beforeEach(() => {
  auth.session = null;
  window.localStorage.clear();
  navigation.params = new URLSearchParams();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
      const slug = /^\/api\/synths\/([^/?]+)/.exec(url)?.[1];
      if (slug) return views[slug] ? json(views[slug]) : new Response("{}", { status: 404 });
      if (url.startsWith("/api/synths")) return json(catalog);
      return new Response("{}", { status: 404 });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

function renderSheet() {
  return render(
    <I18nProvider locale="en">
      <PatchSheet />
    </I18nProvider>,
  );
}

const fetchedViews = () =>
  vi.mocked(fetch).mock.calls.map(([input]) => String(input)).filter((url) => /^\/api\/synths\/[^/?]+/.test(url));

describe("PatchSheet synth selection", () => {
  it("opens the first synth of the list when nothing is remembered, and remembers it", async () => {
    renderSheet();
    expect(await screen.findByRole("region", { name: /TD3/ })).toBeInTheDocument();
    expect(readLastSynth()).toBe("td3");
  });

  it("reopens the synth this browser opened last", async () => {
    writeLastSynth(PROTON_CLONE_SLUG);
    renderSheet();
    await waitFor(() => expect(fetchedViews()).toContain(`/api/synths/${PROTON_CLONE_SLUG}`));
    expect(await screen.findByRole("slider", { name: cloneControlId("knob", "Tune 1") })).toBeInTheDocument();
    expect(fetchedViews()).not.toContain("/api/synths/td3");
  });

  it("follows a synth named in the URL over the remembered one", async () => {
    writeLastSynth("td3");
    navigation.params = new URLSearchParams(`synth=${behringerProton.id}`);
    renderSheet();
    expect(await screen.findByRole("slider", { name: "Tune 1" })).toBeInTheDocument();
    await waitFor(() => expect(readLastSynth()).toBe(behringerProton.id));
    expect(fetchedViews()).toEqual([]);
  });
});

describe("PatchSheet synth list", () => {
  it("marks the built-in Proton as legacy and lists the clone under its plain name", async () => {
    const user = userEvent.setup();
    renderSheet();
    await screen.findByRole("region", { name: /TD3/ });
    await user.click(screen.getByRole("combobox", { name: "Synthesizer" }));
    const options = within(await screen.findByRole("listbox")).getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(expect.arrayContaining(["TD3", "Behringer Proton", "Behringer Proton (Legacy)"]));
  });
});

describe("PatchSheet with the Proton clone as a guest", () => {
  it("shows this browser's legacy Proton patches, migrated, when the clone is opened the first time", async () => {
    new LocalPatchRepository(behringerProton).saveCurrent(legacyLibrary);
    writeLastSynth(PROTON_CLONE_SLUG);
    renderSheet();
    expect(await screen.findByRole("slider", { name: cloneControlId("knob", "Tune 1") })).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByDisplayValue("Legacy Bass")).toBeInTheDocument();
  });
});

describe("PatchSheet importing a legacy Proton export into the clone", () => {
  const copied = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Copied",
    updatedAt: "2026-01-01T00:00:00.000Z",
    revision: 1,
    visibility: "private",
    tags: [],
    data: { knobs: { [cloneControlId("knob", "Tune 2")]: 5 }, switches: {}, leds: {}, cables: [] },
    synthRevision: 1,
    revisionLosses: [],
  };

  it("migrates the patches, adds new ones and matches existing ones by name", async () => {
    auth.session = { user: { id: "user-1", role: "user" } };
    writeLastSynth(PROTON_CLONE_SLUG);
    const created: Array<{ name: string; data: PatchLibrary["patches"][number]["data"] }> = [];
    const base = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST" && url === "/api/patches") {
        created.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ ok: true, revision: 1 }), { status: 201 });
      }
      if (url.startsWith("/api/patches?")) return new Response(JSON.stringify({ patches: [copied] }), { status: 200 });
      return base(input, init);
    });
    const { container } = renderSheet();
    await screen.findByDisplayValue("Copied");

    const exported: PatchLibrary = {
      activeId: "legacy-1",
      patches: [
        { id: "legacy-1", name: "Copied", updatedAt: "2026-01-01T00:00:00.000Z", data: { knobs: { "Tune 2": 5 }, switches: {}, leds: {}, cables: [] } },
        { id: "legacy-2", name: "Legacy Bass", updatedAt: "2026-01-01T00:00:00.000Z", data: { knobs: { "Tune 1": 100 }, switches: {}, leds: {}, cables: [] } },
      ],
    };
    const file = new File([JSON.stringify(encodeLibrary(exported, behringerProton.id))], "proton.json", { type: "application/json" });
    fireEvent.change(container.querySelector<HTMLInputElement>('input[type="file"]')!, { target: { files: [file] } });

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({ name: "Legacy Bass", data: { knobs: { [cloneControlId("knob", "Tune 1")]: 100 } } });
  });
});

