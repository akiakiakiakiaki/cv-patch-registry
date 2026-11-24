/**
 * Gives free tags created before labels started uppercase an uppercase first letter ("acid" → "Acid").
 * Without --apply it only prints the changes. Safe to run again.
 *
 *   npm run tags:capitalize [-- --apply]
 */
import { closeDatabase, ensureDatabase, getDatabase } from "@/lib/db/client";
import { capitalizeTagLabels } from "@/lib/repositories/tags-repository";

const apply = process.argv.includes("--apply");
const handle = getDatabase();
let exitCode = 0;
try {
  await ensureDatabase(handle);
  console.log(`Database: ${handle.provider} · Mode: ${apply ? "APPLY" : "dry run"}`);
  const changes = await capitalizeTagLabels(handle.db, apply);
  if (changes.length === 0) console.log("All tag labels already start uppercase.");
  else console.table(changes);
  if (!apply && changes.length > 0) console.log("Dry run: nothing was written. Run again with --apply to write.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await closeDatabase(handle);
}
process.exit(exitCode);
