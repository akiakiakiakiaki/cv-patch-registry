import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAccountPatchLibrary } from "@/hooks/use-account-patch-library";
import type { PatchLibrary } from "@/lib/domain/types";

const state = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Warm",
  updatedAt: "2026-01-01T00:00:00.000Z",
  revision: 4,
  visibility: "private" as const,
  tags: [],
  data: { knobs: { "Tune 1": 10 }, switches: {}, leds: {}, cables: [] },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useAccountPatchLibrary", () => {
  it("loads the account patches of a synth as a library", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ patches: [state] })));
    const { result } = renderHook(() => useAccountPatchLibrary("behringer-proton", true));
    await waitFor(() => expect(result.current.library?.patches[0]?.name).toBe("Warm"));
    expect(result.current.library?.activeId).toBe(state.id);
  });

  it("saves a changed patch after a short pause, with the revision it was based on", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") return jsonResponse({ ok: true, revision: 5 });
      return jsonResponse({ patches: [state] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAccountPatchLibrary("behringer-proton", true));
    await waitFor(() => expect(result.current.library).not.toBeNull());

    const library = result.current.library as PatchLibrary;
    act(() => {
      result.current.commit({ ...library, patches: [{ ...library.patches[0]!, data: { ...state.data, knobs: { "Tune 1": 20 } } }] });
    });

    await waitFor(() => expect(result.current.status).toBe("saved"), { timeout: 2000 });
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(String(patchCall[0])).toContain(state.id);
    expect(JSON.parse(String(patchCall[1]?.body))).toMatchObject({ expectedRevision: 4, data: { knobs: { "Tune 1": 20 } } });
  });

  it("flushes pending edits before loading another synth", async () => {
    const otherState = { ...state, id: "22222222-2222-4222-8222-222222222222", name: "Other synth patch" };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") return jsonResponse({ ok: true, revision: 5 });
      const synth = new URL(String(input), "http://localhost").searchParams.get("synth");
      return jsonResponse({ patches: [synth === "new-synth" ? otherState : state] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ synth }) => useAccountPatchLibrary(synth, true), {
      initialProps: { synth: "old-synth" },
    });
    await waitFor(() => expect(result.current.library?.patches[0]?.name).toBe("Warm"));

    act(() => {
      const library = result.current.library as PatchLibrary;
      result.current.commit({
        ...library,
        patches: [{ ...library.patches[0]!, data: { ...state.data, knobs: { "Tune 1": 25 } } }],
      });
    });
    rerender({ synth: "new-synth" });

    await waitFor(() => expect(result.current.library?.patches[0]?.name).toBe("Other synth patch"));
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patchCall).toBeDefined();
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({ data: { knobs: { "Tune 1": 25 } } });
  });

  it("flushes pending edits when the account patch editor unmounts", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "PATCH" ? jsonResponse({ ok: true, revision: 5 }) : jsonResponse({ patches: [state] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result, unmount } = renderHook(() => useAccountPatchLibrary("behringer-proton", true));
    await waitFor(() => expect(result.current.library).not.toBeNull());
    act(() => {
      const library = result.current.library as PatchLibrary;
      result.current.commit({
        ...library,
        patches: [{ ...library.patches[0]!, data: { ...state.data, knobs: { "Tune 1": 30 } } }],
      });
    });

    unmount();
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(JSON.parse(String(patchCall[1]?.body))).toMatchObject({ data: { knobs: { "Tune 1": 30 } } });
  });

  it("reports a conflict and reloads when another tab saved first", async () => {
    let loads = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") return jsonResponse({ error: "conflict" }, 409);
      loads += 1;
      return jsonResponse({ patches: [state] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAccountPatchLibrary("behringer-proton", true));
    await waitFor(() => expect(result.current.library).not.toBeNull());
    const library = result.current.library as PatchLibrary;

    act(() => {
      result.current.commit({ ...library, patches: [{ ...library.patches[0]!, name: "Changed" }] });
    });

    await waitFor(() => expect(result.current.status).toBe("conflict"), { timeout: 2000 });
    await waitFor(() => expect(loads).toBeGreaterThan(1));
  });
});
