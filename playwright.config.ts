import { defineConfig, devices } from "@playwright/test";
import { E2E_DATABASE_DIRECTORY } from "./e2e/accounts";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Browser tests against the production build (`npm run build` first; the pre-push hook does both).
 * The app runs on its own throw-away PGlite database with local file storage and mails in the log. Every setting
 * that could reach real data is set here explicitly: these values win over the .env files Next.js loads.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] },
  ],
  webServer: {
    command: `node node_modules/.bin/tsx --tsconfig tsconfig.json scripts/e2e-prepare.mts && node node_modules/.bin/next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      PATCH_DB_PROVIDER: "pglite",
      PATCH_DB_DIR: E2E_DATABASE_DIRECTORY,
      DATABASE_URL: "",
      STORAGE_PROVIDER: "local",
      SUPABASE_URL: "",
      SUPABASE_SECRET_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      MAIL_PROVIDER: "console",
      BREVO_API_KEY: "",
      BETTER_AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else-0123456789",
      BETTER_AUTH_URL: BASE_URL,
      AUTH_REQUIRE_EMAIL_VERIFICATION: "false",
      FEATURE_LEGACY_SYNTHS: "true",
      FEATURE_AUDIO: "false",
      DEVELOPMENT: "false",
    },
  },
});
