import { STORAGE_QUOTA_BYTES } from "@/lib/assets/asset-quota";

/** Hard limits for patch samples. */
export const SAMPLE_MAX_BYTES = 1_500_000;
/** Samples share the per-user storage budget with panels. */
export const SAMPLE_QUOTA_BYTES = STORAGE_QUOTA_BYTES;

/** MP3 starts with an ID3 tag or an MPEG frame sync (11 set bits). OGG is not accepted in this phase. */
export function isMp3(bytes: Uint8Array): boolean {
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  return bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0;
}

const M4A_BRAND = "M4A ";

/**
 * M4A is an MP4 container starting with an "ftyp" box. Only files that declare the audio brand "M4A ",
 * as major or compatible brand, are accepted, so MP4 videos are not taken as samples.
 */
export function isM4a(bytes: Uint8Array): boolean {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length < 16 || ascii(4, 8) !== "ftyp") return false;
  const boxSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  const end = Math.min(boxSize, bytes.length);
  if (ascii(8, 12) === M4A_BRAND) return true;
  // Compatible brands follow the major brand (4 bytes) and the minor version (4 bytes).
  for (let offset = 16; offset + 4 <= end; offset += 4) {
    if (ascii(offset, offset + 4) === M4A_BRAND) return true;
  }
  return false;
}

export type SampleFormat = { extension: "mp3"; mime: "audio/mpeg" } | { extension: "m4a"; mime: "audio/mp4" };

/** The sample format, decided from the bytes and never from the file name. */
export function sampleFormat(bytes: Uint8Array): SampleFormat | null {
  if (isMp3(bytes)) return { extension: "mp3", mime: "audio/mpeg" };
  if (isM4a(bytes)) return { extension: "m4a", mime: "audio/mp4" };
  return null;
}

/** Audio is off unless the server flag is set. The client reads NEXT_PUBLIC_FEATURE_AUDIO separately. */
export function audioEnabled(): boolean {
  return process.env.FEATURE_AUDIO === "true";
}
