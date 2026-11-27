import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import type { MemberRole } from "@/lib/auth/roles";

export type UserRow = typeof user.$inferSelect;

export async function findUserById(db: Database, userId: string): Promise<UserRow | null> {
  const [row] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  return row ?? null;
}

/** Every account except deleted ones, newest first, for the admin's user list. */
export async function listUsers(db: Database): Promise<UserRow[]> {
  return db.select().from(user).where(isNull(user.deletedAt)).orderBy(desc(user.createdAt));
}

/** Changes what an admin may change on an account; false when it does not exist. */
export async function updateUserAdminFields(
  db: Database,
  userId: string,
  change: Partial<{ disabledAt: Date | null; emailVerified: boolean; role: MemberRole }>,
): Promise<boolean> {
  const updated = await db.update(user).set({ ...change, updatedAt: new Date() }).where(eq(user.id, userId)).returning({ id: user.id });
  return updated.length === 1;
}

/** Active admins and owners, except `exceptUserId`: who hears about synths waiting for approval. */
export async function listActiveAdmins(db: Database, exceptUserId: string): Promise<Array<{ email: string; name: string }>> {
  return db
    .select({ email: user.email, name: user.name })
    .from(user)
    .where(and(inArray(user.role, ["admin", "owner"]), isNull(user.disabledAt), isNull(user.deletedAt), ne(user.id, exceptUserId)));
}

