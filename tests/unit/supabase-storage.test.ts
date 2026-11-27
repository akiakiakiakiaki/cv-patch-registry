import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseStorage } from "@/lib/storage/supabase-storage";

const KEY = "0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f.mp3";

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co/");
  vi.stubEnv("SUPABASE_STORAGE_BUCKET", "patch-assets");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("SupabaseStorage.read", () => {
  it("downloads the object with the server key and returns its bytes", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([7, 8, 9]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await new SupabaseStorage().read(KEY)).toEqual(new Uint8Array([7, 8, 9]));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://project.supabase.co/storage/v1/object/patch-assets/${KEY}`);
    expect(init.headers).toEqual({ apikey: "sb_secret_test" });
  });

  it("reports failed downloads and refuses invalid keys without a request", async () => {
    const fetchMock = vi.fn(async () => new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(new SupabaseStorage().read(KEY)).rejects.toThrow("Supabase Storage download failed with status 404: not found");
    await expect(new SupabaseStorage().read("../x.mp3")).rejects.toThrow("Invalid storage key");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("SupabaseStorage for backups", () => {
  it("stores bytes under a given key, replacing a file already there", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await new SupabaseStorage().putAt(KEY, new Uint8Array([1]));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://project.supabase.co/storage/v1/object/patch-assets/${KEY}`);
    expect(init).toMatchObject({ method: "POST", headers: { apikey: "sb_secret_test", "Content-Type": "audio/mpeg", "x-upsert": "true" } });
    await expect(new SupabaseStorage().putAt("../x.mp3", new Uint8Array([1]))).rejects.toThrow("Invalid storage key");
  });

  it("hands out a signed upload URL the browser can send the file to", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ url: `/object/upload/sign/patch-assets/${KEY}?token=abc`, token: "abc" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const target = await new SupabaseStorage().uploadTarget(KEY);
    expect(fetchMock).toHaveBeenCalledWith(`https://project.supabase.co/storage/v1/object/upload/sign/patch-assets/${KEY}`, expect.objectContaining({ method: "POST" }));
    expect(target).toEqual({
      url: `https://project.supabase.co/storage/v1/object/upload/sign/patch-assets/${KEY}?token=abc`,
      method: "PUT",
      headers: { "Content-Type": "audio/mpeg", "x-upsert": "true" },
    });
  });

  it("reports a refused signature", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", { status: 403 })));
    await expect(new SupabaseStorage().uploadTarget(KEY)).rejects.toThrow("Supabase Storage sign upload failed with status 403");
  });
});
