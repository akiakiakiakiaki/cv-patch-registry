// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; role: string } | null }));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => session.user }));

const owner = { id: "account-owner", role: "owner" };
const member = { id: "account-member", role: "user" };

beforeAll(async () => {
  process.env.PATCH_DB_DIR = "memory://";
  const { serverDatabase } = await import("@/lib/db/server");
  const { getDatabase } = await import("@/lib/db/client");
  const { user } = await import("@/lib/db/schema");
  await serverDatabase();
  await getDatabase().db.insert(user).values(
    [owner, member].map((account) => ({ ...account, role: account.role as "user" | "owner", name: account.id, email: `${account.id}@example.test`, emailVerified: true })),
  );
});

const request = async (origin?: string) =>
  (await import("@/app/api/account/deletion-request/route")).POST(
    new Request("http://localhost/api/account/deletion-request", { method: "POST", headers: origin ? { origin } : {} }),
  );

describe("asking for deletion over HTTP", () => {
  it("needs a signed-in account from this site, and not the owner's", async () => {
    session.user = null;
    expect((await request()).status).toBe(401);
    session.user = member;
    expect((await request("https://evil.example")).status).toBe(403);
    session.user = owner;
    expect((await request()).status).toBe(403);
  });

  it("answers 502 when no admin could be told, and 204 once they were", async () => {
    const { ConsoleMailProvider } = await import("@/lib/mail/providers/console-mail-provider");
    const send = vi.spyOn(ConsoleMailProvider.prototype, "send").mockRejectedValueOnce(new Error("down")).mockResolvedValue();
    session.user = member;
    expect((await request()).status).toBe(502);
    expect((await request()).status).toBe(204);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: expect.objectContaining({ email: `${owner.id}@example.test` }) }),
      expect.anything(),
    );
    expect(send.mock.lastCall![0].text).toContain("http://localhost/admin/users");
    vi.restoreAllMocks();
  });
});
