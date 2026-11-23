import { afterEach, describe, expect, it } from "vitest";
import { SAMPLE_MAX_BYTES, audioEnabled, isM4a, isMp3, sampleFormat } from "@/lib/audio/sample-rules";
import { M4A, MP4_VIDEO, ftyp } from "../fixtures/audio";

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

describe("M4A detection", () => {
  it("accepts the M4A brand as major or compatible brand", () => {
    expect(isM4a(M4A)).toBe(true);
    expect(isM4a(ftyp("mp42", ["isom", "M4A "]))).toBe(true);
  });

  it("rejects MP4 videos, other containers and truncated headers", () => {
    expect(isM4a(MP4_VIDEO)).toBe(false);
    expect(isM4a(ftyp("qt  ", ["qt  "]))).toBe(false);
    expect(isM4a(new TextEncoder().encode("RIFF....WAVE....."))).toBe(false);
    expect(isM4a(M4A.subarray(0, 10))).toBe(false);
  });

  it("does not look for brands beyond the ftyp box", () => {
    const bytes = new Uint8Array(40);
    bytes.set(ftyp("isom", ["isom"]).subarray(0, 20), 0);
    bytes.set(Array.from("M4A ", (char) => char.charCodeAt(0)), 30);
    expect(isM4a(bytes)).toBe(false);
  });
});

describe("sample format", () => {
  it("names extension and MIME type from the content", () => {
    expect(sampleFormat(new Uint8Array([0x49, 0x44, 0x33, 0x04]))).toEqual({ extension: "mp3", mime: "audio/mpeg" });
    expect(sampleFormat(M4A)).toEqual({ extension: "m4a", mime: "audio/mp4" });
    expect(sampleFormat(MP4_VIDEO)).toBeNull();
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
