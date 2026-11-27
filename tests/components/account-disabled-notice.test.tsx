import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountDisabledNotice } from "@/components/account-disabled/AccountDisabledNotice";
import { I18nProvider } from "@/i18n/provider";
import { UNAUTHORIZED_EVENT, api } from "@/lib/api/client";

const auth = vi.hoisted(() => ({
  session: null as { user: { id: string; disabledAt?: string | null } } | null,
  refetch: vi.fn(),
  signOut: vi.fn(async () => undefined),
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: { useSession: () => ({ data: auth.session, isPending: false, refetch: auth.refetch }), signOut: auth.signOut },
}));

function renderNotice() {
  return render(
    <I18nProvider locale="en">
      <AccountDisabledNotice />
    </I18nProvider>,
  );
}

afterEach(() => {
  auth.session = null;
  auth.refetch.mockClear();
  vi.unstubAllGlobals();
});

describe("deactivated account notice", () => {
  it("stays hidden for active accounts and visitors", () => {
    auth.session = { user: { id: "u", disabledAt: null } };
    renderNotice();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("tells a deactivated user to contact an admin and signs out on closing", async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    auth.session = { user: { id: "u", disabledAt: "2026-11-27T10:00:00.000Z" } };
    renderNotice();
    const dialog = screen.getByRole("dialog", { name: "Account deactivated" });
    expect(dialog).toHaveTextContent("please contact an admin");
    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
    expect(assign).toHaveBeenCalledWith("/");
  });

  it("reads the session again when the API refuses it", async () => {
    auth.session = { user: { id: "u", disabledAt: null } };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })));
    const heard = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, heard);
    renderNotice();
    await api.synths.list();
    expect(heard).toHaveBeenCalledOnce();
    expect(auth.refetch).toHaveBeenCalled();
    window.removeEventListener(UNAUTHORIZED_EVENT, heard);
  });
});
