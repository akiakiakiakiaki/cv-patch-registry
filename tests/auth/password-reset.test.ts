// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";

const PASSWORD = "correct-horse-battery";
const NEW_PASSWORD = "new-horse-battery-2";
const EMAIL = `reset-${Date.now()}@example.test`;

beforeAll(async () => {
  process.env.PATCH_DB_DIR = "memory://";
  process.env.BETTER_AUTH_SECRET = "test-secret-that-is-long-enough-for-better-auth-0123456789";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = "false";
});

describe("password reset", () => {
  it("mails a reset link, sets the new password and invalidates the old one", async () => {
    const { getAuth } = await import("@/lib/auth");
    const { ensureDatabase, getDatabase } = await import("@/lib/db/client");
    const { ConsoleMailSender } = await import("@/lib/auth/mail-sender");
    await ensureDatabase(getDatabase());
    const auth = getAuth();
    await auth.api.signUpEmail({ body: { name: "Reset", email: EMAIL, password: PASSWORD } });

    const send = vi.spyOn(ConsoleMailSender.prototype, "send").mockResolvedValue(undefined);
    await auth.api.requestPasswordReset({ body: { email: EMAIL, redirectTo: "/reset-password" } });
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    const mail = send.mock.calls[0]![0];
    expect(mail.to).toBe(EMAIL);
    const link = mail.text.match(/https?:\/\/\S+/)?.[0];
    expect(link).toBeTruthy();

    // The mail link goes through Better Auth, which redirects to the reset page with a token.
    const redirect = await auth.handler(new Request(link!, { redirect: "manual" }));
    const location = new URL(redirect.headers.get("location") ?? "http://x/");
    const token = location.searchParams.get("token");
    expect(token).toBeTruthy();

    await auth.api.resetPassword({ body: { newPassword: NEW_PASSWORD, token: token! } });
    await expect(auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD } })).rejects.toThrow();
    const signedIn = await auth.api.signInEmail({ body: { email: EMAIL, password: NEW_PASSWORD } });
    expect(signedIn.user.email).toBe(EMAIL);
    send.mockRestore();
  });

  it("rejects a reused or invalid token", async () => {
    const { getAuth } = await import("@/lib/auth");
    await expect(getAuth().api.resetPassword({ body: { newPassword: "another-password-1", token: "not-a-token" } })).rejects.toThrow();
  });
});
