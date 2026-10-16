import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthForm } from "@/components/auth-forms/AuthForm";
import { I18nProvider } from "@/i18n/provider";

const signIn = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/auth/client", () => ({
  authClient: { signIn: { email: (...args: unknown[]) => signIn(...args) } },
}));

async function submitWith(result: () => Promise<unknown>) {
  signIn.mockImplementation(result);
  const user = userEvent.setup();
  render(
    <I18nProvider locale="en">
      <AuthForm mode="login" />
    </I18nProvider>,
  );
  await user.type(screen.getByLabelText(/^Email/), "player@example.test");
  await user.type(screen.getByLabelText(/^Password/), "whatever-password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  return screen.findByRole("alert");
}

describe("login error messages", () => {
  it("says the credentials are wrong only for a 401", async () => {
    const alert = await submitWith(async () => ({ error: { status: 401 } }));
    expect(alert).toHaveTextContent("Email or password is incorrect");
  });

  it("explains an unverified address for a 403", async () => {
    const alert = await submitWith(async () => ({ error: { status: 403 } }));
    expect(alert).toHaveTextContent("verify your email address");
  });

  it("does not blame the password for a server error", async () => {
    const alert = await submitWith(async () => ({ error: { status: 500 } }));
    expect(alert).toHaveTextContent("could not process the request");
    expect(alert).not.toHaveTextContent("incorrect");
  });

  it("treats a network failure as a server problem", async () => {
    const alert = await submitWith(async () => {
      throw new TypeError("fetch failed");
    });
    expect(alert).toHaveTextContent("could not process the request");
  });
});
