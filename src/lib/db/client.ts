import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/lib/db/schema";
import { seedBuiltInSynths } from "@/lib/db/seed";

export type Database = PgliteDatabase<typeof schema>;

export interface DatabaseHandle {
  client: PGlite;
  db: Database;
}

const DEFAULT_DATA_DIRECTORY = path.join(process.cwd(), ".data", "pglite");
const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

const migrationsByClient = new WeakMap<PGlite, Promise<void>>();

const globalForDatabase = globalThis as typeof globalThis & {
  __patchDatabase?: DatabaseHandle;
};

export function createDatabase(dataDirectory: string): DatabaseHandle {
  if (!dataDirectory.startsWith("memory://")) mkdirSync(dataDirectory, { recursive: true });
  const client = new PGlite(dataDirectory);
  return { client, db: drizzle(client, { schema }) };
}

/** Shared handle per process. Stored on globalThis so Next.js dev reloads reuse it. */
export function getDatabase(): DatabaseHandle {
  globalForDatabase.__patchDatabase ??= createDatabase(
    process.env.PATCH_DB_DIR ?? DEFAULT_DATA_DIRECTORY,
  );
  return globalForDatabase.__patchDatabase;
}

/**
 * Applies pending SQL migrations and mirrors built-in synths, once per database client.
 * Server entry points (auth route, session helpers, data routes) await this before the first query.
 */
export function ensureDatabase(handle: DatabaseHandle = getDatabase()): Promise<void> {
  let migration = migrationsByClient.get(handle.client);
  if (!migration) {
    migration = migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER }).then(() =>
      seedBuiltInSynths(handle.db),
    );
    migrationsByClient.set(handle.client, migration);
  }
  return migration;
}
