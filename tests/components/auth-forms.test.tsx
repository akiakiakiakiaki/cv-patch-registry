import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "@/components/auth-forms/AuthForm";
import { AccountLinks } from "@/components/account-links/AccountLinks";
import { I18nProvider } from "@/i18n/provider";

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

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(signUpEmail).toHaveBeenCalledWith({
      name: "Player",
      email: "player@example.test",
      password: "correct-horse-battery",
    });
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

  it("offers sign-out when a session exists", async () => {
    const user = userEvent.setup();
    useSession.mockReturnValue({ data: { user: { email: "player@example.test" } }, isPending: false });
    renderWithLocale(<AccountLinks />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalled();
  });

  it("has no axe violations", async () => {
    const { container } = renderWithLocale(<AccountLinks />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
