import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "@/components/auth-forms/AuthForm";
import { AccountLinks } from "@/components/account-links/AccountLinks";
import { I18nProvider } from "@/i18n/provider";
import { guestTransferPendingFor } from "@/lib/storage/guest-transfer";

const signUpEmail = vi.fn();
const signInEmail = vi.fn();
const signOut = vi.fn();
const useSession = vi.fn();
const push = vi.fn();

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    signUp: { email: (...args: unknown[]) => signUpEmail(...args) },
    signIn: { email: (...args: unknown[]) => signInEmail(...args) },
    signOut: (...args: unknown[]) => signOut(...args),
    useSession: () => useSession(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function renderWithLocale(node: React.ReactNode) {
  return render(<I18nProvider locale="en">{node}</I18nProvider>);
}

beforeEach(() => {
  signUpEmail.mockResolvedValue({ data: {}, error: null });
  signInEmail.mockResolvedValue({ data: {}, error: null });
  useSession.mockReturnValue({ data: null, isPending: false });
});

describe("AuthForm", () => {
  it("signs in with email and password and returns to the start page", async () => {
    const user = userEvent.setup();
    renderWithLocale(<AuthForm mode="login" />);

    await user.type(screen.getByLabelText(/^Email/), "player@example.test");
    await user.type(screen.getByLabelText(/^Password/), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(signInEmail).toHaveBeenCalledWith({ email: "player@example.test", password: "correct-horse-battery" });
  });

  it("explains that a sign-in is blocked until the email is verified", async () => {
    const user = userEvent.setup();
    signInEmail.mockResolvedValue({ data: null, error: { status: 403, message: "blocked" } });
    renderWithLocale(<AuthForm mode="login" />);

    await user.type(screen.getByLabelText(/^Email/), "player@example.test");
    await user.type(screen.getByLabelText(/^Password/), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Please verify your email address first.");
    expect(push).not.toHaveBeenCalled();
  });

  it("creates an account and navigates when verification is off", async () => {
    const user = userEvent.setup();
    renderWithLocale(<AuthForm mode="register" />);

    await user.type(screen.getByLabelText(/^Name/), "Player");
    await user.type(screen.getByLabelText(/^Email/), "player@example.test");
    await user.type(screen.getByLabelText(/^Password/), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/?welcome=1"));
    expect(signUpEmail).toHaveBeenCalledWith({
      name: "Player",
      email: "player@example.test",
      password: "correct-horse-battery",
      callbackURL: "/?welcome=1",
    });
  });

  it("marks this browser's guest patches for the new account, but not after a failed registration", async () => {
    window.localStorage.clear();
    const user = userEvent.setup();
    signUpEmail.mockResolvedValueOnce({ data: null, error: { status: 422 } });
    renderWithLocale(<AuthForm mode="register" />);
    await user.type(screen.getByLabelText(/^Name/), "Player");
    await user.type(screen.getByLabelText(/^Email/), "Player@Example.test");
    await user.type(screen.getByLabelText(/^Password/), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(signUpEmail).toHaveBeenCalledTimes(1));
    expect(guestTransferPendingFor("player@example.test")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/?welcome=1"));
    expect(guestTransferPendingFor("player@example.test")).toBe(true);
  });

  it("has no axe violations in login and register forms", async () => {
    const login = renderWithLocale(<AuthForm mode="login" />);
    expect(await axe(login.container)).toHaveNoViolations();
    login.unmount();

    const register = renderWithLocale(<AuthForm mode="register" />);
    expect(await axe(register.container)).toHaveNoViolations();
  });
});

describe("AccountLinks", () => {
  it("offers sign-in and registration when logged out", () => {
    renderWithLocale(<AccountLinks />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute("href", "/register");
  });

  it("shows the signed-in user with a menu that opens on hover and holds sign-out", async () => {
    const user = userEvent.setup();
    useSession.mockReturnValue({ data: { user: { name: "Player", email: "player@example.test", role: "user" } }, isPending: false });
    renderWithLocale(<AccountLinks />);
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();

    const account = screen.getByRole("button", { name: "Player" });
    await user.hover(account);
    expect(account).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Request deletion" })).toBeInTheDocument();
    await user.unhover(account);
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());

    await user.click(account);
    expect(await screen.findByRole("menuitem", { name: "Request deletion" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(account).toHaveFocus();

    await user.click(account);
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  it("lets a user ask for deletion: confirmed, sent, signed out", async () => {
    const user = userEvent.setup();
    signOut.mockClear();
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    useSession.mockReturnValue({ data: { user: { name: "Player", email: "player@example.test", role: "user" } }, isPending: false });
    renderWithLocale(<AccountLinks />);
    await user.click(screen.getByRole("button", { name: "Player" }));
    await user.click(screen.getByRole("menuitem", { name: "Request deletion" }));
    const confirmDialog = await screen.findByRole("dialog", { name: "Request deletion of your account?" });
    expect(confirmDialog).toHaveTextContent("deactivated right away");
    await user.click(within(confirmDialog).getByRole("button", { name: "Request deletion" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/account/deletion-request", expect.objectContaining({ method: "POST" }));
    expect(await screen.findByRole("dialog", { name: "Deletion requested" })).toHaveTextContent("you have been signed out");
    expect(signOut).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("keeps the account signed in and says so when the request could not be sent", async () => {
    const user = userEvent.setup();
    signOut.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "mail-failed" }), { status: 502 })));
    useSession.mockReturnValue({ data: { user: { name: "Player", email: "player@example.test", role: "user" } }, isPending: false });
    renderWithLocale(<AccountLinks />);
    await user.click(screen.getByRole("button", { name: "Player" }));
    await user.click(screen.getByRole("menuitem", { name: "Request deletion" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Request deletion" }));
    expect(await screen.findByRole("dialog", { name: "Request not sent" })).toHaveTextContent("stays as it is");
    expect(signOut).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("offers the owner no deletion request", async () => {
    const user = userEvent.setup();
    useSession.mockReturnValue({ data: { user: { name: "Olli", email: "owner@example.test", role: "owner" } }, isPending: false });
    renderWithLocale(<AccountLinks />);
    await user.click(screen.getByRole("button", { name: "Olli" }));
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Request deletion" })).not.toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderWithLocale(<AccountLinks />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
