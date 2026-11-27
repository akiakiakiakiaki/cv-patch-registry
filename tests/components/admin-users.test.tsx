import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserAdminList } from "@/components/admin/UserAdminList";
import { I18nProvider } from "@/i18n/provider";
import type { UserAdminItem } from "@/lib/users/user-admin";

const base = { emailVerified: false, active: true, createdAt: "2026-11-27T10:00:00.000Z", isSelf: false, canManage: true, canChangeRole: true };
const items: UserAdminItem[] = [
  { ...base, id: "me", name: "Me", email: "me@example.test", role: "owner", emailVerified: true, isSelf: true, canManage: false, canChangeRole: false },
  { ...base, id: "ada", name: "Ada", email: "ada@example.test", role: "admin" },
  { ...base, id: "uwe", name: "Uwe", email: "uwe@example.test", role: "user" },
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function renderList(list: UserAdminItem[] = items) {
  return render(
    <I18nProvider locale="en">
      <UserAdminList items={list} />
    </I18nProvider>,
  );
}
const rowOf = (name: string) => screen.getAllByRole("row").find((row) => row.getAttribute("data-user") === name)!;

afterEach(() => vi.unstubAllGlobals());

describe("user management list", () => {
  it("shows the owner and the own account read-only", () => {
    renderList();
    const me = rowOf("me");
    expect(within(me).getByText("you")).toBeInTheDocument();
    expect(within(me).getByText("Owner")).toBeInTheDocument();
    expect(within(me).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(me).getByRole("switch", { name: "Me active (off: deactivated)" })).toBeDisabled();
    expect(within(me).getByRole("switch", { name: "Email of Me confirmed" })).toBeDisabled();
  });

  it("deactivates an account and confirms an email address once the server agrees", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => json(JSON.parse(String(init?.body))));
    vi.stubGlobal("fetch", fetchMock);
    renderList();
    const active = screen.getByRole("switch", { name: "Uwe active (off: deactivated)" });
    await user.click(active);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/admin/users/uwe", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ active: false }) }));
    await waitFor(() => expect(active).not.toBeChecked());

    const verified = screen.getByRole("switch", { name: "Email of Uwe confirmed" });
    await user.click(verified);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/admin/users/uwe", expect.objectContaining({ body: JSON.stringify({ emailVerified: true }) }));
    await waitFor(() => expect(verified).toBeChecked());
  });

  it("changes roles for the owner, and keeps the role when saving fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => json({ role: "admin" })));
    renderList();
    await user.click(within(rowOf("uwe")).getByRole("combobox", { name: "Role of Uwe" }));
    await user.click(await screen.findByRole("option", { name: "Admin" }));
    await waitFor(() => expect(within(rowOf("uwe")).getByRole("combobox", { name: "Role of Uwe" })).toHaveTextContent("Admin"));

    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "forbidden" }, 403)));
    await user.click(within(rowOf("ada")).getByRole("combobox", { name: "Role of Ada" }));
    await user.click(await screen.findByRole("option", { name: "User" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The change for Ada could not be saved.");
    expect(within(rowOf("ada")).getByRole("combobox", { name: "Role of Ada" })).toHaveTextContent("Admin");
  });

  it("shows roles as text where they cannot be changed", () => {
    renderList(items.map((item) => ({ ...item, canChangeRole: false })));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(rowOf("ada")).getByText("Admin")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderList();
    expect(await axe(container)).toHaveNoViolations();
  });
});
