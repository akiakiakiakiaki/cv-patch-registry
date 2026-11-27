import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDatabase } from "../db/client";
import * as authSchema from "../db/auth-schema";
import { resolveLocale } from "../../i18n/config";
import { getMailer } from "../mail/mailer";
import { emailVerificationMail, passwordResetMail } from "../mail/mail-templates";
import { findUserById } from "../repositories/users-repository";
import { MEMBER_ROLES } from "./roles";

/** Error code of a sign-in refused because an admin deactivated the account. */
export const ACCOUNT_DISABLED = "ACCOUNT_DISABLED";

/** Mails go out in the language of the browser that asked for them. */
function localeOf(request: Request | undefined) {
  return resolveLocale({ acceptLanguage: request?.headers.get("accept-language") });
}

/** What a deactivated account may still do: learn about its state, and sign out. */
const ALLOWED_WHEN_DISABLED = new Set(["/get-session", "/sign-out"]);

function createAuth() {
  const requireEmailVerification = process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true";
  const previewBaseUrl = process.env.VERCEL === "1"
    && process.env.VERCEL_ENV === "preview"
    && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : undefined;

  return betterAuth({
    database: drizzleAdapter(getDatabase().db, { provider: "pg", schema: authSchema }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: previewBaseUrl ?? process.env.BETTER_AUTH_URL,
    advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
    user: {
      additionalFields: {
        role: {
          type: [...MEMBER_ROLES],
          required: false,
          defaultValue: "user",
          input: false,
        },
        disabledAt: {
          type: "date",
          required: false,
          input: false,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      requireEmailVerification,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }, request) => {
        await getMailer().send({ email: user.email, name: user.name }, passwordResetMail(localeOf(request), url));
      },
    },
    emailVerification: {
      sendOnSignUp: requireEmailVerification,
      sendOnSignIn: requireEmailVerification,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }, request) => {
        await getMailer().send({ email: user.email, name: user.name }, emailVerificationMail(localeOf(request), url));
      },
    },
    // Matches the countdown of "send again" in VerificationSent, with room for one retry.
    rateLimit: { enabled: true, customRules: { "/send-verification-email": { window: 60, max: 2 } } },
    hooks: {
      // A deactivated account keeps its session (so the app can tell it why), but may not use it for anything else.
      before: createAuthMiddleware(async (ctx) => {
        if (ALLOWED_WHEN_DISABLED.has(ctx.path)) return;
        const current = await getSessionFromCtx(ctx);
        if (current?.user && (current.user as { disabledAt?: unknown }).disabledAt) {
          throw new APIError("FORBIDDEN", { message: "Account disabled", code: ACCOUNT_DISABLED });
        }
      }),
    },
    databaseHooks: {
      session: {
        create: {
          // A deactivated account gets no new session, whichever way it signs in.
          before: async (session) => {
            const account = await findUserById(getDatabase().db, session.userId);
            if (account?.disabledAt) throw new APIError("FORBIDDEN", { message: "Account disabled", code: ACCOUNT_DISABLED });
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

/** Created on first use, so importing this module does not require BETTER_AUTH_SECRET (e.g. during the build). */
export function getAuth() {
  instance ??= createAuth();
  return instance;
}
