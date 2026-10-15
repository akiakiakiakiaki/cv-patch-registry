import { headers } from "next/headers";
import { ensureDatabase } from "@/lib/db/client";
import { getAuth } from "@/lib/auth";

export async function getSession() {
  await ensureDatabase();
  return getAuth().api.getSession({ headers: await headers() });
}

/** Returns the signed-in user, or null. Route handlers answer null with 401. */
export async function requireUser() {
  const session = await getSession();
  return session?.user ?? null;
}
