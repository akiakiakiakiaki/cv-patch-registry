// @vitest-environment node

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let currentRequestHeaders = new Headers();
vi.mock("next/headers", () => ({
  headers: async () => currentRequestHeaders,
}));

type AuthModule = typeof import("@/lib/auth");
type DbModule = typeof import("@/lib/db/client");

let authModule: AuthModule;
let dbModule: DbModule;
let counter = 0;

function uniqueEmail(tag: string): string {
  counter += 1;
  return `${tag}-${Date.now()}-${counter}@example.test`;
}

const PASSWORD = "correct-horse-battery";

async function loadAuth(requireVerification: boolean): Promise<AuthModule> {
  process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = requireVerification ? "true" : "false";
  vi.resetModules();
  authModule = await import("@/lib/auth");
  dbModule = await import("@/lib/db/client");
  await dbModule.ensureDatabase();
  return authModule;
}

beforeAll(() => {
  process.env.PATCH_DB_DIR = "memory://";
  process.env.BETTER_AUTH_SECRET = "test-secret-that-is-long-enough-for-better-auth-0123456789";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
});

beforeEach(() => {
  currentRequestHeaders = new Headers();
  vi.restoreAllMocks();
});

describe("Better Auth on PGlite (verification off)", () => {
  beforeAll(async () => {
    await loadAuth(false);
  });

  it("registers a user and signs in with the same credentials", async () => {
    const email = uniqueEmail("plain");
    await authModule.getAuth().api.signUpEmail({ body: { name: "Plain", email, password: PASSWORD } });
    const result = await authModule.getAuth().api.signInEmail({ body: { email, password: PASSWORD } });
    expect(result.user.email).toBe(email);
  });

  it("rejects a wrong password", async () => {
    const email = uniqueEmail("wrong");
    await authModule.getAuth().api.signUpEmail({ body: { name: "Wrong", email, password: PASSWORD } });
    await expect(
      authModule.getAuth().api.signInEmail({ body: { email, password: "not-the-password" } }),
    ).rejects.toThrow();
  });

  it("rejects a password shorter than the minimum", async () => {
    await expect(
      authModule.getAuth().api.signUpEmail({ body: { name: "Short", email: uniqueEmail("short"), password: "short" } }),
    ).rejects.toThrow();
  });

  it("returns no user without a session cookie", async () => {
    const { requireUser } = await import("@/lib/auth/session");
    await expect(requireUser()).resolves.toBeNull();
  });

  it("resolves the signed-in user from the session cookie", async () => {
    const { requireUser } = await import("@/lib/auth/session");
    const email = uniqueEmail("session");
    await authModule.getAuth().api.signUpEmail({ body: { name: "Session", email, password: PASSWORD } });
    const response = await authModule.getAuth().api.signInEmail({
      body: { email, password: PASSWORD },
      asResponse: true,
    });
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toBeTruthy();
    currentRequestHeaders = new Headers({ cookie: cookie!.split(";")[0]! });
    await expect(requireUser()).resolves.toMatchObject({ email });
  });
});

describe("deactivated accounts", () => {
  beforeAll(async () => {
    await loadAuth(false);
  });

  it("keep a session that only tells them why, and cannot sign in again until reactivated", async () => {
    const { requireUser } = await import("@/lib/auth/session");
    const { changeUser } = await import("@/lib/users/user-admin");
    const { ACCOUNT_DISABLED } = authModule;
    const email = uniqueEmail("disabled");
    const signedUp = await authModule.getAuth().api.signUpEmail({ body: { name: "Disabled", email, password: PASSWORD } });
    const response = await authModule.getAuth().api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
    currentRequestHeaders = new Headers({ cookie: response.headers.get("set-cookie")!.split(";")[0]! });
    await expect(requireUser()).resolves.toMatchObject({ email });

    const db = dbModule.getDatabase().db;
    const admin = { id: "admin-actor", role: "owner" };
    expect(await changeUser(db, admin, signedUp.user.id, { active: false })).toEqual({ ok: true, change: { active: false } });
    // The app's APIs refuse the session ...
    await expect(requireUser()).resolves.toBeNull();
    // ... while reading it shows why, so the app can say so.
    const current = await authModule.getAuth().api.getSession({ headers: currentRequestHeaders });
    expect((current?.user as { disabledAt?: unknown } | undefined)?.disabledAt).toBeTruthy();
    // Better Auth's own endpoints refuse it too, except signing out.
    await expect(authModule.getAuth().api.updateUser({ body: { name: "Renamed" }, headers: currentRequestHeaders })).rejects.toMatchObject({ body: { code: ACCOUNT_DISABLED } });
    await expect(authModule.getAuth().api.signInEmail({ body: { email, password: PASSWORD } })).rejects.toMatchObject({ body: { code: ACCOUNT_DISABLED } });

    await changeUser(db, admin, signedUp.user.id, { active: true });
    await expect(requireUser()).resolves.toMatchObject({ email });
    const again = await authModule.getAuth().api.signInEmail({ body: { email, password: PASSWORD } });
    expect(again.user.email).toBe(email);
  });
});

describe("Better Auth on PGlite (verification on)", () => {
  it("sends a verification mail on sign-up and blocks sign-in until verified", async () => {
    await loadAuth(true);
    const { ConsoleMailSender: FreshConsoleMailSender } = await import("@/lib/auth/mail-sender");
    const sendSpy = vi.spyOn(FreshConsoleMailSender.prototype, "send").mockResolvedValue(undefined);
    const email = uniqueEmail("verify");

    await authModule.getAuth().api.signUpEmail({ body: { name: "Verify", email, password: PASSWORD } });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const mail = sendSpy.mock.calls[0]![0];
    expect(mail.to).toBe(email);

    await expect(
      authModule.getAuth().api.signInEmail({ body: { email, password: PASSWORD } }),
    ).rejects.toThrow();

    const link = mail.text.match(/https?:\/\/\S+/)?.[0];
    expect(link).toBeTruthy();
    const verifyResponse = await authModule.getAuth().handler(new Request(link!));
    expect(verifyResponse.status).toBeLessThan(400);

    const result = await authModule.getAuth().api.signInEmail({ body: { email, password: PASSWORD } });
    expect(result.user.emailVerified).toBe(true);
  });
});
