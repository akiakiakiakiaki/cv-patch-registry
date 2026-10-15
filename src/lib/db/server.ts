import { ensureDatabase, getDatabase, type Database } from "@/lib/db/client";

/** Database for server code (route handlers, server components). Migrations and seeds run once per process. */
export async function serverDatabase(): Promise<Database> {
  const handle = getDatabase();
  await ensureDatabase(handle);
  return handle.db;
}
