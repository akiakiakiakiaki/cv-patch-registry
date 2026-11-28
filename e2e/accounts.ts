/** Where the browser tests keep their own database; scripts/e2e-prepare.mts recreates it before every run. */
export const E2E_DATABASE_DIRECTORY = ".data/e2e-pglite";

/** Accounts the test database starts with (scripts/e2e-prepare.mts) and the saved sign-ins (e2e/auth.setup.ts). */
export const E2E_ACCOUNTS = {
  admin: { id: "e2e-admin", name: "Ada Admin", email: "admin@e2e.test", password: "e2e-admin-password", role: "admin" },
  member: { id: "e2e-member", name: "Uwe User", email: "member@e2e.test", password: "e2e-member-password", role: "user" },
} as const;

export type E2eAccount = keyof typeof E2E_ACCOUNTS;

/** The browser state (cookies) of a signed-in account, written by e2e/auth.setup.ts. */
export function signedInState(name: E2eAccount): string {
  return `test-results/.auth/${name}.json`;
}
