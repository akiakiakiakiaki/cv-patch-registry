import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  signUp: vi.fn(async () => ({ data: {}, error: null as { status: number } | null })),
  resend: vi.fn(async () => ({ data: {}, error: null as { status: number } | null })),
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: { signUp: { email: auth.signUp }, sendVerificationEmail: auth.resend },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetModules();
  auth.resend.mockClear();
});

async function registerWithVerification() {
  vi.stubEnv("NEXT_PUBLIC_AUTH_REQUIRE_EMAIL_VERIFICATION", "true");
  vi.resetModules();
  // Read at import time, so the form and the provider it uses come fresh after stubbing.
  const { AuthForm } = await import("@/components/auth-forms/AuthForm");
  const { I18nProvider } = await import("@/i18n/provider");
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(
    <I18nProvider locale="en">
      <AuthForm mode="register" />
    </I18nProvider>,
  );
  await user.type(screen.getByLabelText(/^Name/), "Player");
  await user.type(screen.getByLabelText(/^Email/), "player@example.test");
  await user.type(screen.getByLabelText(/^Password/), "correct-horse-battery");
  await user.click(screen.getByRole("button", { name: "Create account" }));
  await screen.findByText(/We have sent an email to player@example.test/);
  return user;
}

/** One second at a time: the countdown sets its next timer only after it rendered. */
async function waitSeconds(seconds: number) {
  for (let second = 0; second < seconds; second += 1) {
    await act(async () => void vi.advanceTimersByTime(1000));
  }
}

describe("after registering with email confirmation", () => {
  it("replaces the form with where the mail went, and no second registration", async () => {
    await registerWithVerification();
    expect(screen.queryByRole("button", { name: "Create account" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();
    expect(screen.getByText(/check your spam folder/)).toBeInTheDocument();
  });

  it("lets the user send the mail again once a minute", async () => {
    const user = await registerWithVerification();
    expect(screen.getByRole("button", { name: "Send again in 60 s" })).toBeDisabled();
    await waitSeconds(59);
    expect(screen.getByRole("button", { name: "Send again in 1 s" })).toBeDisabled();
    await waitSeconds(1);
    await user.click(screen.getByRole("button", { name: "Send again" }));
    expect(auth.resend).toHaveBeenCalledWith({ email: "player@example.test", callbackURL: "/?welcome=1" });
    expect(await screen.findByText("We have sent you a new email.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send again in 60 s" })).toBeDisabled();
  });

  it("says when sending again failed, and counts down for the next try", async () => {
    auth.resend.mockResolvedValueOnce({ data: {}, error: { status: 429 } });
    const user = await registerWithVerification();
    await waitSeconds(60);
    await user.click(screen.getByRole("button", { name: "Send again" }));
    expect(await screen.findByText(/could not be sent/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send again in 60 s" })).toBeDisabled();
  });

  it("brings the form back for a different address", async () => {
    const user = await registerWithVerification();
    await user.click(screen.getByRole("button", { name: "Use a different address" }));
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });
});
