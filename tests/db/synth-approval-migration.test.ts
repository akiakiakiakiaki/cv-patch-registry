import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";

/** The migrations folder as it was before synth approvals: everything before 0006. */
function migrationsBeforeApproval(): string {
  const folder = mkdtempSync(path.join(tmpdir(), "migrations-before-"));
  cpSync("drizzle", folder, { recursive: true });
  const journalPath = path.join(folder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: Array<{ tag: string }> };
  journal.entries = journal.entries.slice(0, journal.entries.findIndex((entry) => entry.tag === "0006_synth-approval"));
  writeFileSync(journalPath, JSON.stringify(journal));
  return folder;
}

describe("synth approval migration", () => {
  it("approves every synth that existed before, so nothing disappears", async () => {
    const client = new PGlite("memory://");
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: migrationsBeforeApproval() });
    await client.query(`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ('u1', 'U', 'u@example.test', true, now(), now())`);
    await client.query(`insert into synths (id, owner_id, slug, display_name, created_at) values ('s1', 'u1', 'old-synth', 'Old', '2026-10-01T10:00:00Z')`);

    await migrate(db, { migrationsFolder: "drizzle" });
    // Approved as of its creation (compared in the database: the columns carry no time zone).
    const { rows } = await client.query<{ approved: boolean }>(`select approved_at = created_at as approved from synths where id = 's1'`);
    expect(rows[0]?.approved).toBe(true);

    // Synths created afterwards start unapproved.
    await client.query(`insert into synths (id, owner_id, slug, display_name) values ('s2', 'u1', 'new-synth', 'New')`);
    const fresh = await client.query<{ approved_at: Date | null }>(`select approved_at from synths where id = 's2'`);
    expect(fresh.rows[0]?.approved_at).toBeNull();
    await client.close();
  });
});
