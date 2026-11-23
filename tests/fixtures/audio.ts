/** Minimal MP4 "ftyp" box: size, "ftyp", major brand, minor version, compatible brands. */
export function ftyp(major: string, compatible: string[] = []): Uint8Array {
  const text = ["ftyp", major, "\0\0\0\0", ...compatible].join("");
  const bytes = new Uint8Array(4 + text.length + 8);
  new DataView(bytes.buffer).setUint32(0, 4 + text.length);
  bytes.set(Array.from(text, (char) => char.charCodeAt(0)), 4);
  return bytes;
}

/** What Apple's Voice Memos and ffmpeg write for .m4a files. */
export const M4A = ftyp("M4A ", ["M4A ", "mp42", "isom"]);
/** An MP4 video: no audio brand. */
export const MP4_VIDEO = ftyp("isom", ["isom", "iso2", "avc1", "mp41"]);
