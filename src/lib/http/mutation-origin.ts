import { NextResponse } from "next/server";

/** Rejects browser mutations whose supplied Origin differs from the request's origin. */
export function rejectCrossOriginMutation(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (origin === null) return null;

  try {
    if (new URL(origin).origin === new URL(request.url).origin) return null;
  } catch {
    // An invalid or opaque Origin must not authorize a cookie-authenticated mutation.
  }
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}
