import { afterEach, describe, expect, it, vi } from "vitest";
import { initialSynthSlug, readLastSynth, writeLastSynth } from "@/lib/storage/last-synth";

const catalog = [{ slug: "newest" }, { slug: "td3" }, { slug: "behringer-proton" }];

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("initialSynthSlug", () => {
  it("opens the last synth while it is still listed, otherwise the first of the list", () => {
    expect(initialSynthSlug("td3", catalog)).toBe("td3");
    expect(initialSynthSlug("deleted", catalog)).toBe("newest");
    expect(initialSynthSlug(null, catalog)).toBe("newest");
    expect(initialSynthSlug(null, [])).toBeNull();
  });
});

describe("last synth storage", () => {
  it("remembers the synth in this browser", () => {
    expect(readLastSynth()).toBeNull();
    writeLastSynth("td3");
    expect(readLastSynth()).toBe("td3");
  });

  it("does not fail when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => writeLastSynth("td3")).not.toThrow();
    expect(readLastSynth()).toBeNull();
  });
});
