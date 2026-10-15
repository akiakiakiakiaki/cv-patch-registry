import { NextResponse } from "next/server";
import { serverDatabase } from "@/lib/db/server";
import { listPublicPatches } from "@/lib/patches/patch-service";

export const runtime = "nodejs";

/** Public patches only, no login needed. Filters: ?tag=bass&synth=behringer-proton */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const patches = await listPublicPatches(await serverDatabase(), {
    tagSlug: params.get("tag") ?? undefined,
    synthSlug: params.get("synth") ?? undefined,
  });
  return NextResponse.json({ patches });
}
