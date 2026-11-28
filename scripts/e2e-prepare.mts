/**
 * Builds a fresh, throw-away PGlite database for the browser tests (Playwright): migrations, built-in synths and
 * the test accounts of e2e/accounts.ts. Started by playwright.config.ts before the app; refuses any other database,
 * so a test run never touches the dev or production data.
 */
import { rmSync } from "node:fs";
import { hashPassword } from "better-auth/crypto";
import { account, user } from "@/lib/db/auth-schema";
import { closeDatabase, ensureDatabase, getDatabase } from "@/lib/db/client";
import { E2E_ACCOUNTS, E2E_DATABASE_DIRECTORY } from "../e2e/accounts";

if (process.env.PATCH_DB_PROVIDER !== "pglite" || process.env.PATCH_DB_DIR !== E2E_DATABASE_DIRECTORY) {
  console.error(`Browser tests run only on the PGlite database ${E2E_DATABASE_DIRECTORY}; start them with npm run test:e2e.`);
  process.exit(1);
}

rmSync(E2E_DATABASE_DIRECTORY, { recursive: true, force: true });
rmSync(`${E2E_DATABASE_DIRECTORY}.lock`, { force: true });

const handle = getDatabase();
try {
  await ensureDatabase(handle);
  for (const person of Object.values(E2E_ACCOUNTS)) {
    await handle.db.insert(user).values({ id: person.id, name: person.name, email: person.email, emailVerified: true, role: person.role });
    await handle.db.insert(account).values({
      id: `${person.id}-credential`,
      accountId: person.id,
      providerId: "credential",
      userId: person.id,
      password: await hashPassword(person.password),
    });
  }
  console.log(`Browser test database ready: ${E2E_DATABASE_DIRECTORY}`);
} finally {
  await closeDatabase(handle);
}
