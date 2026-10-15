import { afterEach, describe, expect, it } from "vitest";
import { SAMPLE_MAX_BYTES, audioEnabled, isMp3 } from "@/lib/audio/sample-rules";

afterEach(() => {
  delete process.env.FEATURE_AUDIO;
});

describe("MP3 detection", () => {
  it("accepts an ID3 tagged file and a bare MPEG frame", () => {
    expect(isMp3(new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]))).toBe(true);
    expect(isMp3(new Uint8Array([0xff, 0xfb, 0x90, 0x64]))).toBe(true);
  });

  it("rejects WAV, OGG and random bytes", () => {
    expect(isMp3(new TextEncoder().encode("RIFF....WAVE"))).toBe(false);
    expect(isMp3(new TextEncoder().encode("OggS"))).toBe(false);
    expect(isMp3(new Uint8Array([0x00, 0x01]))).toBe(false);
  });

  it("keeps the hard size limit at 1.5 MB", () => {
    expect(SAMPLE_MAX_BYTES).toBe(1_500_000);
  });
});

describe("audio feature flag", () => {
  it("is off unless FEATURE_AUDIO is exactly true", () => {
    expect(audioEnabled()).toBe(false);
    process.env.FEATURE_AUDIO = "1";
    expect(audioEnabled()).toBe(false);
    process.env.FEATURE_AUDIO = "true";
    expect(audioEnabled()).toBe(true);
  });
});
