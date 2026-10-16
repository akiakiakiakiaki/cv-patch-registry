import { headers } from "next/headers";
import { ensureDatabase } from "@/lib/db/client";
import { getAuth } from "@/lib/auth";
import { isMemberRole } from "@/lib/auth/roles";

export async function getSession() {
  await ensureDatabase();
  return getAuth().api.getSession({ headers: await headers() });
}

/** Returns the signed-in user, or null. Route handlers answer null with 401. */
export async function requireUser() {
  const session = await getSession();
  return session?.user && isMemberRole(session.user.role) ? session.user : null;
}
