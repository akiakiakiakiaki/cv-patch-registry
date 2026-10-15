import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createDatabase } from "@/lib/db/client";

describe("PGlite database client", () => {
  it("opens an in-memory Postgres and runs queries through Drizzle", async () => {
    const { client, db } = await createDatabase("memory://");
    const result = await db.execute<{ value: number }>(sql`select 1 as value`);
    expect(result.rows[0]?.value).toBe(1);
    await client.close();
  });
});
