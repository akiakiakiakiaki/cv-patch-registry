import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDatabase } from "../db/client";
import * as authSchema from "../db/auth-schema";
import { getMailSender } from "./mail-sender";

function createAuth() {
  const requireEmailVerification = process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true";

  return betterAuth({
    database: drizzleAdapter(getDatabase().db, { provider: "pg", schema: authSchema }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      requireEmailVerification,
    },
    emailVerification: {
      sendOnSignUp: requireEmailVerification,
      sendOnSignIn: requireEmailVerification,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await getMailSender().send({
          to: user.email,
          subject: "Bitte bestätige deine E-Mail-Adresse",
          text: `Bestätige deine E-Mail-Adresse: ${url}`,
        });
      },
    },
    rateLimit: { enabled: true },
    plugins: [nextCookies()],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

/** Created on first use, so importing this module does not require BETTER_AUTH_SECRET (e.g. during the build). */
export function getAuth() {
  instance ??= createAuth();
  return instance;
}
