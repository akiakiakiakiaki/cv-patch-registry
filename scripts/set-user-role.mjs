import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function acquirePGliteLock(dataDirectory) {
  if (!existsSync(dataDirectory)) {
    throw new Error("PGlite directory not found. Start the app once to initialize its database.");
  }

  const lockPath = `${dataDirectory}.lock`;
  if (existsSync(lockPath)) {
    const owner = Number(readFileSync(lockPath, "utf8").trim());
    if (Number.isInteger(owner) && owner > 0 && isAlive(owner)) {
      throw new Error("Stop the development server before changing a role in PGlite.");
    }
    unlinkSync(lockPath);
  }

  writeFileSync(lockPath, String(process.pid), { flag: "wx" });
  return lockPath;
}

function releasePGliteLock(lockPath) {
  if (!lockPath || !existsSync(lockPath)) return;
  if (Number(readFileSync(lockPath, "utf8").trim()) === process.pid) unlinkSync(lockPath);
}

async function updatePostgres(email, role) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when PATCH_DB_PROVIDER=postgres.");
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const result = await pool.query(
      'UPDATE public."user" SET role = $1 WHERE lower(email) = lower($2) RETURNING id',
      [role, email],
    );
    return result.rowCount ?? 0;
  } finally {
    await pool.end();
  }
}

async function updatePGlite(email, role) {
  const configuredDirectory = process.env.PATCH_DB_DIR || path.join(".data", "pglite");
  if (configuredDirectory.startsWith("memory://")) {
    throw new Error("Role changes need a file-backed PGlite database.");
  }

  const dataDirectory = path.resolve(process.cwd(), configuredDirectory);
  const lockPath = acquirePGliteLock(dataDirectory);
  let database;
  try {
    database = new PGlite(dataDirectory);
    await database.waitReady;
    const result = await database.query(
      'UPDATE public."user" SET role = $1 WHERE lower(email) = lower($2) RETURNING id',
      [role, email],
    );
    return result.rows.length;
  } finally {
    try {
      await database?.close();
    } finally {
      releasePGliteLock(lockPath);
    }
  }
}

const [email, role] = process.argv.slice(2);
if (!email || (role !== "user" && role !== "admin")) {
  console.error("Usage: npm run db:set-role -- <email> <user|admin>");
  process.exitCode = 2;
} else {
  try {
    const provider = process.env.PATCH_DB_PROVIDER ?? "pglite";
    const updated = provider === "pglite"
      ? await updatePGlite(email.trim(), role)
      : provider === "postgres"
        ? await updatePostgres(email.trim(), role)
        : (() => { throw new Error(`Unsupported PATCH_DB_PROVIDER: ${provider}`); })();

    if (updated === 0) {
      console.error("No account found for that email.");
      process.exitCode = 1;
    } else {
      console.log(`Updated role to ${role}. Sign in again to refresh the session.`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Could not update the role.");
    process.exitCode = 1;
  }
}
