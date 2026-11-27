import { describe, expect, it, vi } from "vitest";
import { createDatabase, ensureDatabase } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { notifyAdminsOfPendingSynth } from "@/lib/synths/synth-notifications";

describe("approval notifications", () => {
  it("go to every active admin and the owner, not to the creator, and never fail", async () => {
    const handle = createDatabase("memory://");
    await ensureDatabase(handle);
    await handle.db.insert(user).values([
      { id: "owner", name: "Olli", email: "owner@example.test", emailVerified: true, role: "owner" },
      { id: "admin", name: "Ada", email: "admin@example.test", emailVerified: true, role: "admin" },
      { id: "off", name: "Off", email: "off@example.test", emailVerified: true, role: "admin", disabledAt: new Date() },
      { id: "user", name: "Uwe", email: "user@example.test", emailVerified: true },
    ]);
    const send = vi.fn(async (to: { email: string }, _content: { subject: string }) => {
      if (to.email === "owner@example.test") throw new Error("mailbox full");
    });
    const result = await notifyAdminsOfPendingSynth(handle.db, { send }, {
      synthName: "TD3",
      creator: { id: "admin", name: "Ada", email: "admin@example.test" },
      reviewUrl: "https://app.example/admin/synths",
    });
    expect(send.mock.calls.map(([to]) => to.email)).toEqual(["owner@example.test"]);
    expect(result).toEqual({ sent: 0, failed: 1 });

    send.mockClear();
    await notifyAdminsOfPendingSynth(handle.db, { send }, { synthName: "TD3", creator: { id: "user", name: "Uwe", email: "user@example.test" }, reviewUrl: "https://app.example/admin/synths" });
    expect(send.mock.calls.map(([to]) => to.email).sort()).toEqual(["admin@example.test", "owner@example.test"]);
    expect(send.mock.calls[0]![1]).toMatchObject({ subject: "New synth awaits approval: TD3" });
    await handle.client.close();
  });
});
