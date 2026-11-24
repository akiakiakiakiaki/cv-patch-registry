/**
 * Copies the built-in (legacy) Behringer Proton into the editable synth `behringer-proton-v2`, owned by the
 * given account, and copies every user's Proton patches to it. Without --apply it only prints the plan.
 * Safe to run again: the clone is reused and patches already copied are skipped.
 *
 *   npm run proton:clone -- --owner-email admin@example.com [--panel scripts/assets/behringer-proton-v2-panel.png] [--apply]
 */
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { user } from "@/lib/db/auth-schema";
import { closeDatabase, ensureDatabase, getDatabase } from "@/lib/db/client";
import { getStorage } from "@/lib/storage";
import { cloneLegacyProton } from "@/lib/synths/proton-clone-service";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const ownerEmail = option("--owner-email");
const panelPath = option("--panel") ?? "scripts/assets/behringer-proton-v2-panel.png";
const apply = process.argv.includes("--apply");

if (!ownerEmail) {
  console.error("Usage: npm run proton:clone -- --owner-email <email> [--panel <png>] [--apply]");
  process.exit(1);
}

const handle = getDatabase();
let exitCode = 0;
try {
  await ensureDatabase(handle);
  const [owner] = await handle.db.select({ id: user.id, email: user.email }).from(user).where(eq(user.email, ownerEmail));
  if (!owner) throw new Error(`No account with e-mail ${ownerEmail}`);

  console.log(`Database: ${handle.provider} · Storage: ${process.env.STORAGE_PROVIDER ?? "local"} · Mode: ${apply ? "APPLY" : "dry run"}`);
  const result = await cloneLegacyProton(
    { db: handle.db, storage: getStorage() },
    { ownerId: owner.id, panelBytes: new Uint8Array(readFileSync(panelPath)), apply },
  );
  if (!result.ok) {
    console.error("Refused:", result);
    exitCode = 1;
  } else {
    console.log(`Synth behringer-proton-v2: ${result.report.synth === "create" ? (apply ? "created" : "will be created") : "already exists"} (owner ${owner.email})`);
    console.table(
      result.report.patches.map((patch) => ({
        patch: patch.name,
        owner: patch.ownerId.slice(0, 8),
        action: patch.action === "exists" ? "already copied" : apply ? "copied" : "will be copied",
        sample: patch.sample ? "yes" : "",
        knobs: patch.values.knobs,
        switches: patch.values.switches,
        leds: patch.values.leds,
        cables: patch.values.cables,
      })),
    );
    if (!apply) console.log("Dry run: nothing was written. Run again with --apply to write.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await closeDatabase(handle);
}
process.exit(exitCode);
