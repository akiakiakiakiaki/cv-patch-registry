import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { SynthAdminList } from "@/components/admin/SynthAdminList";
import { AccountLinks } from "@/components/account-links/AccountLinks";
import { SynthApprovalStatus } from "@/components/patch-sheet/SynthApprovalStatus";
import { SynthVisibilityChip } from "@/components/patch-sheet/SynthVisibilityChip";
import { I18nProvider } from "@/i18n/provider";
import type { SynthAdminItem } from "@/lib/synths/synth-admin";

const session = vi.hoisted(() => ({ user: null as { id: string; role: string } | null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/synths", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth/client", () => ({
  authClient: { useSession: () => ({ data: session.user ? { user: session.user } : null, isPending: false }), signOut: vi.fn() },
}));

const items: SynthAdminItem[] = [
  { slug: "td3", displayName: "TD3", manufacturer: "Behringer", owner: { name: "Ada", email: "ada@example.test", deleted: false }, approved: true, createdAt: "2026-10-01T10:00:00.000Z", revision: 22, storedRevisions: 22, deleted: false, removableRevisions: 19, patchCount: 4, patchOwnerCount: 2 },
  { slug: "fresh", displayName: "Fresh Synth", manufacturer: null, owner: { name: "Olga", email: "olga@example.test", deleted: false }, approved: false, createdAt: "2026-11-27T10:00:00.000Z", revision: 1, storedRevisions: 1, deleted: false, removableRevisions: 0, patchCount: 0, patchOwnerCount: 0 },
  { slug: "behringer-proton", displayName: "Behringer Proton", manufacturer: null, owner: null, approved: true, createdAt: "2026-09-01T10:00:00.000Z", revision: 3, storedRevisions: 1, deleted: false, removableRevisions: 0, patchCount: 1, patchOwnerCount: 1 },
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function renderList() {
  return render(
    <I18nProvider locale="en">
      <SynthAdminList items={items} />
    </I18nProvider>,
  );
}

const switchOf = (name: string) => screen.getByRole("switch", { name: `Approve ${name}` });

afterEach(() => vi.unstubAllGlobals());

describe("synth management list", () => {
  it("shows waiting synths first with their creator, and counts them", () => {
    renderList();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => row.getAttribute("data-synth"))).toEqual(["fresh", "td3", "behringer-proton"]);
    expect(within(rows[0]!).getByText("olga@example.test")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Awaiting approval")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 synth(s) awaiting approval.");
    expect(within(rows[0]!).getByRole("link", { name: "Fresh Synth" })).toHaveAttribute("href", "/?synth=fresh");
  });

  it("approves and takes the approval back with the switch", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => json({ ok: true, approved: JSON.parse(String(init?.body)).approved }));
    vi.stubGlobal("fetch", fetchMock);
    renderList();
    await user.click(switchOf("Fresh Synth"));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/synths/fresh", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ approved: true }) }));
    await waitFor(() => expect(switchOf("Fresh Synth")).toBeChecked());
    expect(screen.getByRole("status")).toHaveTextContent("No synths awaiting approval.");
    // The row stays where it is.
    expect(screen.getAllByRole("row")[1]).toHaveAttribute("data-synth", "fresh");

    await user.click(switchOf("TD3"));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/admin/synths/td3", expect.objectContaining({ body: JSON.stringify({ approved: false }) }));
    await waitFor(() => expect(switchOf("TD3")).not.toBeChecked());
  });

  it("puts the switch back and says so when saving fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "forbidden" }, 403)));
    renderList();
    await user.click(switchOf("Fresh Synth"));
    expect(await screen.findByRole("alert")).toHaveTextContent("The approval of “Fresh Synth” could not be saved.");
    expect(switchOf("Fresh Synth")).not.toBeChecked();
  });

  it("keeps built-in synths approved", () => {
    renderList();
    expect(switchOf("Behringer Proton (Legacy)")).toBeDisabled();
    expect(switchOf("Behringer Proton (Legacy)")).toBeChecked();
  });

  it("has no axe violations", async () => {
    const { container } = renderList();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("admin navigation", () => {
  it("offers the admin area in the header to admins only", () => {
    session.user = { id: "u", role: "user" };
    const { unmount } = render(
      <I18nProvider locale="en">
        <AccountLinks />
      </I18nProvider>,
    );
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
    unmount();
    session.user = { id: "a", role: "admin" };
    render(
      <I18nProvider locale="en">
        <AccountLinks />
      </I18nProvider>,
    );
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
    session.user = null;
  });

  it("lists the sections in a side pane and marks the current one", () => {
    render(
      <I18nProvider locale="en">
        <AdminLayout>
          <p>Section content</p>
        </AdminLayout>
      </I18nProvider>,
    );
    const nav = screen.getByRole("navigation", { name: "Administration" });
    expect(within(nav).getByRole("link", { name: "Synth management" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Users" })).toHaveAttribute("href", "/admin/users");
    expect(within(nav).getByRole("link", { name: "Users" })).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Section content")).toBeInTheDocument();
  });
});

describe("synth visibility status", () => {
  const renderChip = (approved: boolean, ownedByViewer: boolean) =>
    render(
      <I18nProvider locale="en">
        <SynthVisibilityChip approved={approved} ownedByViewer={ownedByViewer} />
      </I18nProvider>,
    );

  it.each([
    [false, true, "Awaiting approval – visible only to you"],
    [false, false, "Awaiting approval – visible only to its creator and admins"],
    [true, true, "Approved – visible to everyone"],
    [true, false, "Approved – visible to everyone"],
  ])("approved %s, own %s: %s", (approved, own, text) => {
    renderChip(approved, own);
    expect(screen.getByRole("status")).toHaveTextContent(text);
  });
});

describe("approval below the panel", () => {
  function renderStatus(props: { approved: boolean; canApprove: boolean; ownedByViewer?: boolean }) {
    const onApprovalChange = vi.fn();
    render(
      <I18nProvider locale="en">
        <SynthApprovalStatus slug="fresh" ownedByViewer={props.ownedByViewer ?? false} approved={props.approved} canApprove={props.canApprove} onApprovalChange={onApprovalChange} />
      </I18nProvider>,
    );
    return { onApprovalChange };
  }

  it("lets admins approve right there", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => json({ ok: true, approved: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { onApprovalChange } = renderStatus({ approved: false, canApprove: true });
    expect(screen.getByRole("status")).toHaveTextContent("Awaiting approval – visible only to its creator and admins");
    // While waiting, the switch says what it does.
    expect(screen.queryByRole("switch", { name: "Approved" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Approve" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/synths/fresh", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ approved: true }) }));
    await waitFor(() => expect(onApprovalChange).toHaveBeenCalledWith(true));
  });

  it("says so when the approval could not be saved", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "forbidden" }, 403)));
    const { onApprovalChange } = renderStatus({ approved: true, canApprove: true });
    await user.click(screen.getByRole("switch", { name: "Approved" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The approval could not be saved.");
    expect(onApprovalChange).not.toHaveBeenCalled();
  });

  it("shows creators the status only", () => {
    renderStatus({ approved: false, canApprove: false, ownedByViewer: true });
    expect(screen.getByRole("status")).toHaveTextContent("Awaiting approval – visible only to you");
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });
});

describe("approval switch while saving", () => {
  /** A fetch that answers only when the test says so. */
  function pendingFetch() {
    let answer: (response: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    return { answer: (body: unknown, status = 200) => answer(json(body, status)) };
  }
  const spinnerShown = () => getComputedStyle(screen.getByTestId("saving-switch-spinner")).visibility === "visible";

  it("keeps its state, disabled with a spinner, until the server confirms; then takes the new state", async () => {
    const user = userEvent.setup();
    const server = pendingFetch();
    const onApprovalChange = vi.fn();
    render(
      <I18nProvider locale="en">
        <SynthApprovalStatus slug="fresh" approved={false} ownedByViewer={false} canApprove onApprovalChange={onApprovalChange} />
      </I18nProvider>,
    );
    const toggle = screen.getByRole("switch", { name: "Approve" });
    expect(spinnerShown()).toBe(false);
    await user.click(toggle);

    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAttribute("aria-busy", "true");
    expect(spinnerShown()).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("Awaiting approval");

    server.answer({ ok: true, approved: true });
    const approved = await screen.findByRole("switch", { name: "Approved" });
    expect(approved).toBeChecked();
    expect(approved).toBeEnabled();
    expect(spinnerShown()).toBe(false);
    // The status follows at once, before the page has reloaded the synth.
    expect(screen.getByRole("status")).toHaveTextContent("Approved – visible to everyone");
    expect(onApprovalChange).toHaveBeenCalledWith(true);
  });

  it("behaves the same in the admin list", async () => {
    const user = userEvent.setup();
    const server = pendingFetch();
    renderList();
    await user.click(switchOf("Fresh Synth"));
    expect(switchOf("Fresh Synth")).toBeDisabled();
    expect(switchOf("Fresh Synth")).not.toBeChecked();
    server.answer({ ok: true, approved: true });
    await waitFor(() => expect(switchOf("Fresh Synth")).toBeChecked());
    expect(switchOf("Fresh Synth")).toBeEnabled();
  });
});

describe("synth management actions", () => {
  const deletedItem: SynthAdminItem = {
    slug: "gone", displayName: "Gone Synth", manufacturer: null, owner: { name: "Olga", email: "olga@example.test", deleted: false },
    approved: true, deleted: true, createdAt: "2026-11-01T10:00:00.000Z", revision: 5, storedRevisions: 5, removableRevisions: 2, patchCount: 3, patchOwnerCount: 2,
  };
  function renderWith(list: SynthAdminItem[]) {
    return render(
      <I18nProvider locale="en">
        <SynthAdminList items={list} />
      </I18nProvider>,
    );
  }
  const activeOf = (name: string) => screen.getByRole("switch", { name: `${name} active (off: deleted)` });

  it("shows deleted synths last, crossed out, with a red active switch and their approval still changeable", () => {
    renderWith([deletedItem, ...items]);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.at(-1)).toHaveAttribute("data-synth", "gone");
    expect(within(rows.at(-1)!).getByText("Deleted")).toBeInTheDocument();
    expect(within(rows.at(-1)!).queryByRole("link", { name: "Gone Synth" })).not.toBeInTheDocument();
    expect(activeOf("Gone Synth")).not.toBeChecked();
    expect(switchOf("Gone Synth")).toBeEnabled();
    expect(switchOf("Gone Synth")).toBeChecked();
    expect(activeOf("TD3")).toBeChecked();
    expect(activeOf("TD3").closest(".MuiSwitch-root")?.querySelector(".MuiSwitch-switchBase")).toHaveClass("MuiSwitch-colorSuccess");
  });

  it("deletes and restores with the active switch once the server confirms", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => json({ ok: true, deleted: JSON.parse(String(init?.body)).deleted }));
    vi.stubGlobal("fetch", fetchMock);
    renderWith([deletedItem, ...items]);
    await user.click(activeOf("TD3"));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/admin/synths/td3", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ deleted: true }) }));
    await waitFor(() => expect(activeOf("TD3")).not.toBeChecked());
    expect(within(screen.getByRole("row", { name: /TD3/ })).getByText("Deleted")).toBeInTheDocument();

    await user.click(activeOf("Gone Synth"));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/admin/synths/gone", expect.objectContaining({ body: JSON.stringify({ deleted: false }) }));
    await waitFor(() => expect(activeOf("Gone Synth")).toBeChecked());
  });

  it("deletes for good only deleted synths, after a clear warning", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    renderWith([deletedItem, ...items]);
    expect(screen.queryByRole("button", { name: "Delete TD3 for good" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete Gone Synth for good" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete synth for good?" });
    expect(dialog).toHaveTextContent("3 patch(es) of 2 user(s)");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete Gone Synth for good" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Delete synth for good?" })).getByRole("button", { name: "Delete for good" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/synths/gone", { method: "DELETE" });
    await waitFor(() => expect(screen.queryByRole("row", { name: /Gone Synth/ })).not.toBeInTheDocument());
    expect(screen.getByText("“Gone Synth” was deleted for good.")).toBeInTheDocument();
  });

  it("reduces revisions after asking, and only where there is something to remove", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => json({ ok: true, removed: 19 }));
    vi.stubGlobal("fetch", fetchMock);
    renderList();
    expect(screen.getByRole("button", { name: "Reduce revisions of Fresh Synth" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Reduce revisions of TD3" }));
    const dialog = await screen.findByRole("dialog", { name: "Reduce revisions?" });
    expect(dialog).toHaveTextContent("19 old revision(s) of “TD3” will be removed");
    expect(dialog).toHaveTextContent("the newest 3, the current one and every revision a patch uses");
    await user.click(within(dialog).getByRole("button", { name: "Reduce revisions" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/synths/td3/revisions", { method: "DELETE" });
    expect(await screen.findByText("19 revision(s) of “TD3” removed.")).toBeInTheDocument();
    // The current revision keeps its number; the stored count goes down.
    const row = screen.getByRole("row", { name: /TD3/ });
    expect(within(row).getByText("22")).toBeInTheDocument();
    expect(within(row).getByText("3 stored")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reduce revisions of TD3" })).toBeDisabled();
  });
});
