import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";
import { ensureDatabase } from "@/lib/db/client";

export const runtime = "nodejs";

let handler: ReturnType<typeof toNextJsHandler> | undefined;
function authHandler() {
  handler ??= toNextJsHandler(getAuth());
  return handler;
}

export async function GET(request: Request) {
  await ensureDatabase();
  return authHandler().GET(request);
}

export async function POST(request: Request) {
  await ensureDatabase();
  return authHandler().POST(request);
}
