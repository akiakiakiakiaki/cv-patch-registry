import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuestPatchTransfer, PATCHES_IMPORTED_EVENT } from "@/components/guest-transfer/GuestPatchTransfer";
import { guestTransferPendingFor, markGuestTransferPending } from "@/lib/storage/guest-transfer";
import { instrumentFromSynth } from "@/lib/instruments/from-synth";
import { LocalPatchRepository } from "@/lib/storage/local-patch-repository";
import { testLayout } from "../fixtures/instrument";

const session = vi.hoisted(() => ({ email: null as string | null }));
vi.mock("@/lib/auth/client", () => ({
  authClient: { useSession: () => ({ data: session.email ? { user: { id: "u1", email: session.email } } : null, isPending: false }) },
}));

const td3 = { slug: "td3", displayName: "TD3", panelUrl: "/x.png", layout: { ...testLayout, id: "td3" } };
let imports: Array<{ synthSlug: string; patches: { name: string }[] }>;

beforeEach(() => {
  window.localStorage.clear();
  imports = [];
  new LocalPatchRepository(instrumentFromSynth(td3)).saveCurrent({
    activeId: "a",
    patches: [{ id: "a", name: "Bass", updatedAt: "2026-01-01T00:00:00.000Z", data: { knobs: {}, switches: {}, leds: {}, cables: [] } }],
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/patches/import") {
        imports.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ ok: true, created: 1 }), { status: 201 });
      }
      if (url === "/api/synths/td3") return new Response(JSON.stringify(td3), { status: 200 });
      return new Response("{}", { status: 404 });
    }),
  );
});

describe("GuestPatchTransfer", () => {
  it("moves the guest patches into the account registered in this browser and tells open libraries", async () => {
    markGuestTransferPending("player@example.test");
    session.email = "Player@example.test";
    const imported = vi.fn();
    window.addEventListener(PATCHES_IMPORTED_EVENT, imported);
    render(<GuestPatchTransfer />);
    await waitFor(() => expect(imports).toEqual([{ synthSlug: "td3", patches: [expect.objectContaining({ name: "Bass" })] }]));
    await waitFor(() => expect(imported).toHaveBeenCalledTimes(1));
    expect(guestTransferPendingFor("player@example.test")).toBe(false);
    window.removeEventListener(PATCHES_IMPORTED_EVENT, imported);
  });

  it("does nothing for other accounts or without a pending transfer", async () => {
    markGuestTransferPending("someone@example.test");
    session.email = "player@example.test";
    render(<GuestPatchTransfer />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(imports).toEqual([]);
    expect(guestTransferPendingFor("someone@example.test")).toBe(true);
  });
});
