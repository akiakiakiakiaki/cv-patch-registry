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
