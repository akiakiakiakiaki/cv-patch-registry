import path from "node:path";
import { defineConfig } from "drizzle-kit";

if (process.env.PATCH_DB_PROVIDER && process.env.PATCH_DB_PROVIDER !== "pglite") {
  throw new Error("Drizzle Studio config points to the local PGlite database only.");
}

const dataDirectory = process.env.PATCH_DB_DIR ?? path.join(process.cwd(), ".data", "pglite");

if (dataDirectory.startsWith("memory://")) {
  throw new Error("Drizzle Studio requires the file-backed PGlite database.");
}

export default defineConfig({
  dialect: "postgresql",
  driver: "pglite",
  schema: "./src/lib/db/schema.ts",
  dbCredentials: {
    url: path.resolve(process.cwd(), dataDirectory),
  },
});
