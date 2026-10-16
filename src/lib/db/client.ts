import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { migrate as migratePostgres } from "drizzle-orm/node-postgres/migrator";
import * as schema from "@/lib/db/schema";
import { seedBuiltInSynths } from "@/lib/db/seed";

export type Database = PgliteDatabase<typeof schema>;

export interface DatabaseHandle {
  client: { waitReady?: Promise<unknown>; close: () => Promise<void> };
  db: Database;
  provider: "pglite" | "postgres";
  migrate: () => Promise<void>;
  /** Lock file of a file-backed database, null for in-memory databases. */
  lockPath: string | null;
}

const DEFAULT_DATA_DIRECTORY = path.join(process.cwd(), ".data", "pglite");
const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

const migrationsByClient = new WeakMap<object, Promise<void>>();

const globalForDatabase = globalThis as typeof globalThis & {
  __patchDatabase?: DatabaseHandle;
  __patchDatabaseSignals?: boolean;
};

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * PGlite has no lock of its own. Two processes writing the same directory corrupt it, so a lock file
 * with the owner's PID guards it. A lock left behind by a dead process is taken over.
 */
function acquireLock(lockPath: string): void {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const descriptor = openSync(lockPath, "wx", 0o600);
      try {
        writeSync(descriptor, String(process.pid));
      } finally {
        closeSync(descriptor);
      }
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }

    let owner = 0;
    let lockContents = "";
    try {
      lockContents = readFileSync(lockPath, "utf8");
      owner = Number(lockContents.trim());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (Number.isInteger(owner) && owner > 0 && isAlive(owner)) {
      throw new Error(`Die Datenbank wird bereits von Prozess ${owner} verwendet. Beende ihn zuerst (oder nutze PATCH_DB_DIR).`);
    }

    // Check again before removing a stale lock, in case another process replaced it.
    try {
      if (readFileSync(lockPath, "utf8") === lockContents) unlinkSync(lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error("Die Datenbank-Sperre konnte nicht übernommen werden. Prüfe die Lock-Datei und starte erneut.");
}

function releaseLock(lockPath: string | null): void {
  if (!lockPath || !existsSync(lockPath)) return;
  if (Number(readFileSync(lockPath, "utf8").trim()) === process.pid) unlinkSync(lockPath);
}

export function createDatabase(dataDirectory: string): DatabaseHandle {
  const inMemory = dataDirectory.startsWith("memory://");
  let lockPath: string | null = null;
  if (!inMemory) {
    mkdirSync(path.dirname(dataDirectory), { recursive: true });
    lockPath = `${dataDirectory}.lock`;
    acquireLock(lockPath);
  }
  const client = new PGlite(dataDirectory);
  const db = drizzle(client, { schema });
  return {
    client,
    db,
    provider: "pglite",
    migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    lockPath,
  };
}

function createPostgresDatabase(connectionString: string): DatabaseHandle {
  const maxConnections = Number(process.env.PATCH_DB_POOL_MAX ?? "1");
  if (!Number.isInteger(maxConnections) || maxConnections < 1) {
    throw new Error("PATCH_DB_POOL_MAX must be a positive integer");
  }
  const pool = new Pool({ connectionString, max: maxConnections });
  const postgresDb = drizzlePostgres(pool, { schema });
  return {
    client: { close: () => pool.end() },
    // Repositories use only Drizzle's shared PostgreSQL query API. PGlite remains the
    // canonical compile-time type; the driver-specific cast is confined to this boundary.
    db: postgresDb as unknown as Database,
    provider: "postgres",
    migrate: () => migratePostgres(postgresDb, { migrationsFolder: MIGRATIONS_FOLDER }),
    lockPath: null,
  };
}

/** Closes the database and releases its lock. Used on shutdown and in tests. */
export async function closeDatabase(handle: DatabaseHandle): Promise<void> {
  try {
    await handle.client.waitReady;
    await handle.client.close();
  } finally {
    releaseLock(handle.lockPath);
  }
}

/** Shared handle per process. Stored on globalThis so Next.js dev reloads reuse it. */
export function getDatabase(): DatabaseHandle {
  if (!globalForDatabase.__patchDatabase) {
    const provider = process.env.PATCH_DB_PROVIDER ?? "pglite";
    if (provider === "pglite") {
      globalForDatabase.__patchDatabase = createDatabase(process.env.PATCH_DB_DIR ?? DEFAULT_DATA_DIRECTORY);
    } else if (provider === "postgres") {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) throw new Error("DATABASE_URL is required when PATCH_DB_PROVIDER=postgres");
      globalForDatabase.__patchDatabase = createPostgresDatabase(connectionString);
    } else {
      throw new Error(`Unsupported PATCH_DB_PROVIDER: ${provider}`);
    }
    registerShutdown();
  }
  return globalForDatabase.__patchDatabase;
}

/**
 * On Ctrl+C or a termination signal, close the database first, then let the signal do its normal work.
 * A killed process without this leaves the files in an unclean state.
 */
function registerShutdown(): void {
  if (globalForDatabase.__patchDatabaseSignals) return;
  globalForDatabase.__patchDatabaseSignals = true;
  const handle = globalForDatabase.__patchDatabase;
  if (!handle) return;
  process.once("exit", () => releaseLock(handle.lockPath));
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void closeDatabase(handle).finally(() => process.kill(process.pid, signal));
    });
  }
}

/**
 * Applies pending SQL migrations and mirrors built-in synths, once per database client.
 * Server entry points (auth route, session helpers, data routes) await this before the first query.
 */
export function ensureDatabase(handle: DatabaseHandle = getDatabase()): Promise<void> {
  let migration = migrationsByClient.get(handle.client);
  if (!migration) {
    migration = handle.migrate().then(() => seedBuiltInSynths(handle.db));
    migrationsByClient.set(handle.client, migration);
  }
  return migration;
}
