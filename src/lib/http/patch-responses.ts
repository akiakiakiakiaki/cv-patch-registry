import { NextResponse } from "next/server";
import type { PatchFailure } from "@/lib/patches/patch-service";

/** One mapping from service failures to HTTP, shared by all patch routes. */
export function failureResponse(failure: PatchFailure): NextResponse {
  switch (failure.error) {
    case "invalid":
      return NextResponse.json({ error: "invalid", issues: failure.issues }, { status: 422 });
    case "conflict":
      return NextResponse.json({ error: "conflict" }, { status: 409 });
    case "invalid-tags":
    case "too-many-tags":
      return NextResponse.json({ error: failure.error }, { status: 422 });
    case "not-found":
    case "synth-not-found":
      return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function readJson(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
