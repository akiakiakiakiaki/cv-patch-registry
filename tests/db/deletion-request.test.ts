import { describe, expect, it, vi } from "vitest";
import { createDatabase, ensureDatabase } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import type { MailContent } from "@/lib/mail/mail-templates";
import type { Mailer } from "@/lib/mail/mailer";
import { findUserById } from "@/lib/repositories/users-repository";
import { requestAccountDeletion } from "@/lib/users/deletion-request";

const REVIEW_URL = "https://app.example/admin/users";

async function setup() {
  const handle = createDatabase("memory://");
  await ensureDatabase(handle);
  const db = handle.db;
  await db.insert(user).values([
    { id: "owner", name: "Olli", email: "owner@example.test", emailVerified: true, role: "owner" },
    { id: "admin", name: "Ada", email: "admin@example.test", emailVerified: true, role: "admin" },
    { id: "uwe", name: "Uwe", email: "uwe@example.test", emailVerified: true },
  ]);
  const sent: Array<{ to: string; content: MailContent }> = [];
  const mailer: Mailer = { send: vi.fn(async (to, content) => void sent.push({ to: to.email, content })) };
  return { db, mailer, sent, cleanup: () => handle.client.close() };
}

describe("asking for the own account to be deleted", () => {
  it("tells every admin and the owner, then deactivates the account", async () => {
    const env = await setup();
    expect(await requestAccountDeletion(env, "uwe", REVIEW_URL)).toEqual({ ok: true });
    expect(env.sent.map((mail) => mail.to).sort()).toEqual(["admin@example.test", "owner@example.test"]);
    const { content } = env.sent[0]!;
    expect(content.subject).toBe("Account deletion requested: Uwe");
    expect(content.text).toContain("Uwe (uwe@example.test) asked for their account to be deleted");
    expect(content.text).toContain(REVIEW_URL);
    expect((await findUserById(env.db, "uwe"))?.disabledAt).toBeInstanceOf(Date);
    expect(await requestAccountDeletion(env, "uwe", REVIEW_URL)).toEqual({ ok: false, error: "not-found" });
    await env.cleanup();
  });

  it("goes through when at least one admin was told", async () => {
    const env = await setup();
    vi.mocked(env.mailer.send).mockRejectedValueOnce(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await requestAccountDeletion(env, "uwe", REVIEW_URL)).toEqual({ ok: true });
    vi.restoreAllMocks();
    await env.cleanup();
  });

  it("changes nothing when no admin could be told", async () => {
    const env = await setup();
    vi.mocked(env.mailer.send).mockRejectedValue(new Error("down"));
    expect(await requestAccountDeletion(env, "uwe", REVIEW_URL)).toEqual({ ok: false, error: "mail-failed" });
    expect((await findUserById(env.db, "uwe"))?.disabledAt).toBeNull();
    await env.cleanup();
  });

  it("is not open to the owner", async () => {
    const env = await setup();
    expect(await requestAccountDeletion(env, "owner", REVIEW_URL)).toEqual({ ok: false, error: "forbidden" });
    expect(env.mailer.send).not.toHaveBeenCalled();
    expect(await requestAccountDeletion(env, "nobody", REVIEW_URL)).toEqual({ ok: false, error: "not-found" });
    await env.cleanup();
  });
});
