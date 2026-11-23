import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAccountPatchLibrary } from "@/hooks/use-account-patch-library";
import type { PatchLibrary } from "@/lib/domain/types";
import type { RevisionLoss } from "@/lib/patches/revision-loss";

const state = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Warm",
  updatedAt: "2026-01-01T00:00:00.000Z",
  revision: 4,
  visibility: "private" as const,
  tags: [],
  data: { knobs: { "Tune 1": 10 }, switches: {}, leds: {}, cables: [] },
  synthRevision: 1,
  revisionLosses: [] as RevisionLoss[],
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
  describe("patches on an older synth revision", () => {
    const loss = { kind: "knob" as const, id: "knob-00000001", label: "Cutoff", value: 91 };
    const lossBody = { error: "revision-loss", fromRevision: 5, toRevision: 7, losses: [loss] };
    const current: typeof state = { ...state, synthRevision: 7, revisionLosses: [] };

    type Decision = "upgrade" | "restore" | "keep";
    function setupLoss(onRevisionLoss: (prompt: unknown) => Promise<Decision>, listed = current) {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          const body = JSON.parse(String(init.body)) as { acceptRevisionLoss?: boolean; keepRevision?: boolean };
          return body.acceptRevisionLoss || body.keepRevision ? jsonResponse({ ok: true, revision: 5 }) : jsonResponse(lossBody, 409);
        }
        return jsonResponse({ patches: [listed] });
      });
      vi.stubGlobal("fetch", fetchMock);
      const hook = renderHook(() => useAccountPatchLibrary("td3", true, { onRevisionLoss }));
      const patchBodies = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH").map(([, init]) => JSON.parse(String(init?.body)));
      const loads = () => fetchMock.mock.calls.filter(([, init]) => init?.method !== "PATCH").length;
      return { hook, patchBodies, loads };
    }

    async function edit(result: { current: ReturnType<typeof useAccountPatchLibrary> }, tune = 30) {
      await waitFor(() => expect(result.current.library).not.toBeNull());
      const library = result.current.library as PatchLibrary;
      act(() => {
        result.current.commit({ ...library, patches: [{ ...library.patches[0]!, data: { ...state.data, knobs: { "Tune 1": tune } } }] });
      });
    }

    it("reports patches whose revision lacks controls as outdated, and saves them on their own revision", async () => {
      const onRevisionLoss = vi.fn();
      const { hook, patchBodies } = setupLoss(onRevisionLoss, { ...state, synthRevision: 5, revisionLosses: [loss] });
      await waitFor(() => expect(hook.result.current.outdated).toEqual({ [state.id]: { revision: 5, losses: [loss] } }));
      await edit(hook.result);

      await waitFor(() => expect(hook.result.current.status).toBe("saved"), { timeout: 2000 });
      expect(patchBodies()).toEqual([expect.objectContaining({ keepRevision: true, data: expect.objectContaining({ knobs: { "Tune 1": 30 } }) })]);
      expect(onRevisionLoss).not.toHaveBeenCalled();
    });

    it("on save asks with the patch name and the losses; 'upgrade' resends with acceptRevisionLoss", async () => {
      const onRevisionLoss = vi.fn().mockResolvedValue("upgrade");
      const { hook, patchBodies } = setupLoss(onRevisionLoss);
      await edit(hook.result);

      await waitFor(() => expect(hook.result.current.status).toBe("saved"), { timeout: 2000 });
      expect(onRevisionLoss).toHaveBeenCalledWith({ patchName: "Warm", fromRevision: 5, toRevision: 7, losses: [loss] });
      expect(patchBodies()).toHaveLength(2);
      expect(patchBodies()[1]).toMatchObject({ acceptRevisionLoss: true, expectedRevision: 4, data: { knobs: { "Tune 1": 30 } } });
      expect(hook.result.current.outdated).toEqual({});
    });

    it("'keep' keeps the edits, saves them on the older revision and marks the patch outdated", async () => {
      const onRevisionLoss = vi.fn().mockResolvedValue("keep");
      const { hook, patchBodies, loads } = setupLoss(onRevisionLoss);
      await edit(hook.result);

      await waitFor(() => expect(hook.result.current.status).toBe("saved"), { timeout: 2000 });
      expect(patchBodies()[1]).toMatchObject({ keepRevision: true, data: { knobs: { "Tune 1": 30 } } });
      expect(hook.result.current.library?.patches[0]?.data.knobs).toEqual({ "Tune 1": 30 });
      expect(hook.result.current.outdated).toEqual({ [state.id]: { revision: 5, losses: [loss] } });
      expect(loads()).toBe(1);

      // Later edits go straight to the older revision without asking again.
      await edit(hook.result, 40);
      await waitFor(() => expect(patchBodies()).toHaveLength(3), { timeout: 2000 });
      expect(patchBodies()[2]).toMatchObject({ keepRevision: true, data: { knobs: { "Tune 1": 40 } } });
      expect(onRevisionLoss).toHaveBeenCalledTimes(1);
    });

    it("'restore' reloads the last saved version and sends nothing more", async () => {
      const onRevisionLoss = vi.fn().mockResolvedValue("restore");
      const { hook, patchBodies } = setupLoss(onRevisionLoss);
      await edit(hook.result);

      await waitFor(() => expect(onRevisionLoss).toHaveBeenCalled(), { timeout: 2000 });
      await waitFor(() => expect(hook.result.current.library?.patches[0]?.data.knobs).toEqual({ "Tune 1": 10 }));
      expect(patchBodies()).toHaveLength(1);
      expect(hook.result.current.status).toBe("idle");
    });

    it("upgrade() moves an outdated patch to the current revision and reloads it", async () => {
      const onRevisionLoss = vi.fn();
      const { hook, patchBodies, loads } = setupLoss(onRevisionLoss, { ...state, synthRevision: 5, revisionLosses: [loss] });
      await waitFor(() => expect(hook.result.current.outdated[state.id]).toBeDefined());

      await act(() => hook.result.current.upgrade(state.id));
      expect(patchBodies()).toEqual([expect.objectContaining({ acceptRevisionLoss: true, expectedRevision: 4 })]);
      expect(patchBodies()[0]).not.toHaveProperty("keepRevision");
      expect(loads()).toBe(2);
      expect(onRevisionLoss).not.toHaveBeenCalled();
    });
  });
});
