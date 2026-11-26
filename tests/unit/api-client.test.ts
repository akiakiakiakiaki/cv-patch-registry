import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api/client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("reads without cache and encodes path segments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ slug: "a b" }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await api.synths.get("a b/c");
    expect(fetchMock).toHaveBeenCalledWith("/api/synths/a%20b%2Fc", { cache: "no-store" });
    expect(result).toEqual({ ok: true, status: 200, data: { slug: "a b" } });
  });

  it("sends JSON bodies with the method and content type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ revision: 3 }));
    vi.stubGlobal("fetch", fetchMock);
    await api.patches.update("p1", { name: "Bass", expectedRevision: 2 });
    expect(fetchMock).toHaveBeenCalledWith("/api/patches/p1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Bass", expectedRevision: 2 }),
    });
  });

  it("sends files as they are", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ sample: { url: "/s", title: "T", license: "CC0" } }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["x"], "a.wav");
    await api.patches.uploadSample("p1", file, { title: "T", rights: "true" });
    expect(fetchMock).toHaveBeenCalledWith("/api/patches/p1/sample?title=T&rights=true", { method: "POST", body: file });
  });

  it("reports the error code and body of a failed request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "revision-loss", fromRevision: 1 }, 409)));
    expect(await api.patches.update("p1", {})).toEqual({
      ok: false,
      status: 409,
      error: "revision-loss",
      body: { error: "revision-loss", fromRevision: 1 },
    });
  });

  it("tolerates empty or non-JSON bodies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    expect(await api.synths.remove("x")).toEqual({ ok: true, status: 204, data: {} });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 500 })));
    expect(await api.synths.remove("x")).toEqual({ ok: false, status: 500, error: undefined, body: {} });
  });

  it("resolves status 0 when the server cannot be reached, but passes aborts on", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await api.synths.list()).toEqual({ ok: false, status: 0, body: {} });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")));
    await expect(api.tags.suggest("a")).rejects.toThrow("aborted");
  });
});
