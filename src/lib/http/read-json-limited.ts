import { readBodyLimited } from "@/lib/http/read-limited";

export type ReadJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "invalid" | "too-large" };

/** Parses JSON while enforcing a byte limit before decoding or parsing it. */
export async function readJsonLimited(request: Request, maxBytes: number): Promise<ReadJsonResult> {
  let bytes: Uint8Array | null;
  try {
    bytes = await readBodyLimited(request, maxBytes);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (bytes === null) return { ok: false, reason: "too-large" };

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
