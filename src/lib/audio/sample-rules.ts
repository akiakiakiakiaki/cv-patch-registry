/** Hard limits for patch samples. Duration is only checked in the browser (see README: known gap). */
export const SAMPLE_MAX_BYTES = 1_500_000;
export const SAMPLE_QUOTA_BYTES = 50 * 1024 * 1024;

/** MP3 starts with an ID3 tag or an MPEG frame sync (11 set bits). OGG is not accepted in this phase. */
export function isMp3(bytes: Uint8Array): boolean {
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  return bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0;
}

/** Audio is off unless the server flag is set. The client reads NEXT_PUBLIC_FEATURE_AUDIO separately. */
export function audioEnabled(): boolean {
  return process.env.FEATURE_AUDIO === "true";
}
