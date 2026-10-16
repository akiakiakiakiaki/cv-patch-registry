// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { closeDatabase, createDatabase } from "@/lib/db/client";

function freshDirectory(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), "pglite-lock-")), "pglite");
}

describe("database lock", () => {
  it("keeps committed data across a close and reopen", async () => {
    const dir = freshDirectory();
    const first = createDatabase(dir);
    await first.client.waitReady;
    await first.db.execute(sql`create table persistence_check (value text not null)`);
    await first.db.execute(sql`insert into persistence_check (value) values ('survives restart')`);
    await closeDatabase(first);

    const reopened = createDatabase(dir);
    const result = await reopened.db.execute<{ value: string }>(sql`select value from persistence_check`);
    expect(result.rows[0]?.value).toBe("survives restart");
    await closeDatabase(reopened);
  }, 20_000);

  it("refuses a second open while the first one is alive", async () => {
    const dir = freshDirectory();
    const first = createDatabase(dir);
    expect(() => createDatabase(dir)).toThrow("wird bereits von Prozess");
    await closeDatabase(first);
  }, 20_000);

  it("releases the lock on close so the directory can be reopened", async () => {
    const dir = freshDirectory();
    const first = createDatabase(dir);
    await closeDatabase(first);
    expect(existsSync(`${dir}.lock`)).toBe(false);
    const second = createDatabase(dir);
    expect((await second.db.execute<{ ok: number }>(sql`select 1 as ok`)).rows[0]?.ok).toBe(1);
    await closeDatabase(second);
  }, 20_000);

  it("takes over a lock left behind by a dead process", async () => {
    const dir = freshDirectory();
    writeFileSync(`${dir}.lock`, "999999");
    const handle = createDatabase(dir);
    expect(readFileSync(`${dir}.lock`, "utf8")).toBe(String(process.pid));
    await closeDatabase(handle);
  }, 20_000);
});

