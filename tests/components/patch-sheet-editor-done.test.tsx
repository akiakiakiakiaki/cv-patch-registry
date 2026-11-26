import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EDITOR_FULL_HEIGHT_CLASS, PatchSheet } from "@/components/patch-sheet/PatchSheet";
import { AccountLinks } from "@/components/account-links/AccountLinks";
import { authClient } from "@/lib/auth/client";
import { PATCHES_IMPORTED_EVENT } from "@/components/guest-transfer/GuestPatchTransfer";
import { I18nProvider } from "@/i18n/provider";
import { testLayout } from "../fixtures/instrument";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("synth=custom-synth"),
  useRouter: () => router,
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "user-1", role: "user" } }, isPending: false }), signOut: vi.fn() },
}));

const view = {
  slug: "custom-synth",
  displayName: "Custom Synth",
  manufacturer: null,
  revision: 1,
  isBuiltIn: false,
  ownerId: "user-1",
  layout: testLayout,
  panelUrl: "/assets/uploads/0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f.png",
};
const patch = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Mine",
  updatedAt: "2026-01-01T00:00:00.000Z",
  revision: 1,
  visibility: "private",
  tags: [],
  data: { knobs: {}, switches: {}, leds: {}, cables: [] },
  synthRevision: 1,
  revisionLosses: [],
};
let revisionPosts: number;

beforeEach(() => {
  window.localStorage.clear();
  revisionPosts = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
      if (url.endsWith("/revisions") && init?.method === "POST") {
        revisionPosts += 1;
        return json({ ok: true, revision: 2 }, 201);
      }
      if (url.startsWith("/api/synths/custom-synth")) return json(view);
      if (url.startsWith("/api/synths/other-synth")) return json({ ...view, slug: "other-synth", displayName: "Other Synth" });
      if (url.startsWith("/api/synths")) {
        return json({
          synths: [
            { slug: "custom-synth", displayName: "Custom Synth", isBuiltIn: false },
            { slug: "other-synth", displayName: "Other Synth", isBuiltIn: false },
          ],
        });
      }
      if (url.startsWith("/api/patches?")) return json({ patches: [patch] });
      return json({}, 404);
    }),
  );
});

async function openEditorWithChange(user: ReturnType<typeof userEvent.setup>) {
  render(
    <I18nProvider locale="en">
      <PatchSheet />
    </I18nProvider>,
  );
  await user.click(await screen.findByRole("button", { name: "Edit" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Knob" }));
}

/** The "Done" button next to the synth selector, not the one in the editor's sidebar. */
function toolbarDone() {
  const sidebar = screen.getByRole("complementary");
  return screen.getAllByRole("button", { name: "Done" }).find((button) => !sidebar.contains(button))!;
}

describe("PatchSheet top bar Done button while editing", () => {
  it("asks about unsaved changes like the editor's own Done button, and keeps editing on request", async () => {
    const user = userEvent.setup();
    await openEditorWithChange(user);
    await user.click(toolbarDone());
    const dialog = await screen.findByRole("dialog", { name: "Changes not saved" });
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });

  it("discards and closes the editor", async () => {
    const user = userEvent.setup();
    await openEditorWithChange(user);
    await user.click(toolbarDone());
    await user.click(within(await screen.findByRole("dialog", { name: "Changes not saved" })).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.queryByRole("complementary")).not.toBeInTheDocument());
    expect(revisionPosts).toBe(0);
  });

  it("saves a revision and closes", async () => {
    const user = userEvent.setup();
    await openEditorWithChange(user);
    await user.click(toolbarDone());
    await user.click(within(await screen.findByRole("dialog", { name: "Changes not saved" })).getByRole("button", { name: "Save and close" }));
    await waitFor(() => expect(screen.queryByRole("complementary")).not.toBeInTheDocument());
    expect(revisionPosts).toBe(1);
  });

  it("closes at once without changes", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider locale="en">
        <PatchSheet />
      </I18nProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await screen.findByRole("complementary");
    await user.click(toolbarDone());
    await waitFor(() => expect(screen.queryByRole("complementary")).not.toBeInTheDocument());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("PatchSheet window-height layout while editing", () => {
  it("marks the document while the editor is open, and removes the mark when it closes", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider locale="en">
        <PatchSheet />
      </I18nProvider>,
    );
    await screen.findByRole("button", { name: "Edit" });
    expect(document.documentElement).not.toHaveClass(EDITOR_FULL_HEIGHT_CLASS);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByRole("complementary");
    expect(document.documentElement).toHaveClass(EDITOR_FULL_HEIGHT_CLASS);
    await user.click(toolbarDone());
    await waitFor(() => expect(document.documentElement).not.toHaveClass(EDITOR_FULL_HEIGHT_CLASS));
  });
});

describe("PatchSheet bars", () => {
  async function renderLoaded() {
    render(
      <I18nProvider locale="en">
        <PatchSheet />
      </I18nProvider>,
    );
    return screen.findByRole("button", { name: "Edit" });
  }

  it("puts Edit right of the synth selector, and the active patch into the patch row", async () => {
    const edit = await renderLoaded();
    const selector = screen.getByRole("combobox", { name: "Synthesizer" });
    const topBar = selector.closest("section")!;
    expect(topBar.contains(edit)).toBe(true);
    expect(selector.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(edit.compareDocumentPosition(within(topBar).getByRole("button", { name: /^Patches/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Same size as the other buttons of the bar.
    const patches = within(topBar).getByRole("button", { name: /^Patches/ });
    expect(edit).toHaveClass("MuiButton-sizeMedium");
    expect(patches).toHaveClass("MuiButton-sizeMedium");

    const name = screen.getByRole("textbox", { name: "Active patch name" });
    expect(topBar.contains(name)).toBe(false);
    expect(screen.getByRole("main").contains(name)).toBe(true);
    expect(screen.queryByText(/drag or click/)).not.toBeInTheDocument();
  });

  it("hides the patch row while editing and shows it again after Done", async () => {
    const user = userEvent.setup();
    await user.click(await renderLoaded());
    await screen.findByRole("complementary");
    expect(screen.queryByRole("textbox", { name: "Active patch name" })).not.toBeInTheDocument();
    expect(screen.queryByText("Saved to your account")).not.toBeInTheDocument();
    await user.click(toolbarDone());
    expect(await screen.findByRole("textbox", { name: "Active patch name" })).toBeInTheDocument();
    expect(screen.getByText("Saved to your account")).toBeInTheDocument();
  });
});

describe("PatchSheet with a new patch", () => {
  it("asks for the patch's view only after the server created it", async () => {
    const user = userEvent.setup();
    let finishCreate: () => void = () => {};
    let createdId = "";
    const base = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input) === "/api/patches" && init?.method === "POST") {
        createdId = (JSON.parse(String(init.body)) as { id: string }).id;
        await new Promise<void>((resolve) => (finishCreate = resolve));
        return new Response(JSON.stringify({ ok: true, id: createdId, revision: 1 }), { status: 201 });
      }
      return base(input, init);
    });
    render(
      <I18nProvider locale="en">
        <PatchSheet />
      </I18nProvider>,
    );
    await user.click(await screen.findByRole("button", { name: /New patch/ }));
    await waitFor(() => expect(createdId).not.toBe(""));
    const viewRequests = () => vi.mocked(fetch).mock.calls.filter(([input]) => String(input) === `/api/patches/${createdId}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(viewRequests()).toHaveLength(0);

    finishCreate();
    await waitFor(() => expect(viewRequests()).toHaveLength(1));
  });
});

describe("PatchSheet modes", () => {
  it("hides the patch functions of the top bar while editing and shows them again after Done", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider locale="en">
        <PatchSheet />
      </I18nProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await screen.findByRole("complementary");
    expect(screen.queryByTestId("patch-actions")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New patch/ })).not.toBeInTheDocument();
    await user.click(toolbarDone());
    expect(await screen.findByTestId("patch-actions")).toBeInTheDocument();
  });

  async function switchSynthWithChanges(user: ReturnType<typeof userEvent.setup>) {
    await openEditorWithChange(user);
    await user.click(screen.getByRole("combobox", { name: "Synthesizer" }));
    await user.click(await screen.findByRole("option", { name: "Other Synth" }));
    return screen.findByRole("dialog", { name: "Changes not saved" });
  }

  it("asks before switching synths with unsaved changes and stays on request", async () => {
    const user = userEvent.setup();
    const dialog = await switchSynthWithChanges(user);
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Synthesizer" })).toHaveTextContent("Custom Synth");
  });

  it("switches synths after discarding the changes", async () => {
    const user = userEvent.setup();
    const dialog = await switchSynthWithChanges(user);
    await user.click(within(dialog).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Synthesizer" })).toHaveTextContent("Other Synth"));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(revisionPosts).toBe(0);
  });

  it("warns before the tab closes only while changes are unsaved", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider locale="en">
        <PatchSheet />
      </I18nProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await screen.findByRole("complementary");
    const unload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Add Knob" }));
    expect(unload()).toBe(true);
  });

  it("asks before signing out with unsaved changes and stays signed in on request", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider locale="en">
        <AccountLinks />
        <PatchSheet />
      </I18nProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Knob" }));
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    const dialog = await screen.findByRole("dialog", { name: "Changes not saved" });
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(authClient.signOut).not.toHaveBeenCalled();
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });
});

describe("PatchSheet after guest patches were moved into the account", () => {
  it("reloads the account library", async () => {
    render(
      <I18nProvider locale="en">
        <PatchSheet />
      </I18nProvider>,
    );
    await screen.findByRole("button", { name: "Edit" });
    const loads = () => vi.mocked(fetch).mock.calls.filter(([input]) => String(input).startsWith("/api/patches?")).length;
    const before = loads();
    window.dispatchEvent(new Event(PATCHES_IMPORTED_EVENT));
    await waitFor(() => expect(loads()).toBe(before + 1));
  });
});

describe("PatchSheet links while editing", () => {
  async function clickExploreWithChanges(user: ReturnType<typeof userEvent.setup>) {
    router.push.mockClear();
    render(
      <I18nProvider locale="en">
        <AccountLinks />
        <PatchSheet />
      </I18nProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Knob" }));
    await user.click(screen.getByRole("link", { name: "Explore" }));
    return screen.findByRole("dialog", { name: "Changes not saved" });
  }

  it("asks before following Explore with unsaved changes and stays on request", async () => {
    const user = userEvent.setup();
    const dialog = await clickExploreWithChanges(user);
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });

  it("follows Explore after discarding the changes", async () => {
    const user = userEvent.setup();
    const dialog = await clickExploreWithChanges(user);
    await user.click(within(dialog).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/explore"));
    expect(revisionPosts).toBe(0);
  });
});

