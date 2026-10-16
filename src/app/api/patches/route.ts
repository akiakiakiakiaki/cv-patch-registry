import { NextResponse } from "next/server";
import { serverDatabase } from "@/lib/db/server";
import { requireUser } from "@/lib/auth/session";
import { failureResponse, invalidJsonResponse, unauthorized } from "@/lib/http/patch-responses";
import { readJsonLimited } from "@/lib/http/read-json-limited";
import { rejectCrossOriginMutation } from "@/lib/http/mutation-origin";
import { createPatch, listOwnPatchStates, listOwnPatches } from "@/lib/patches/patch-service";

export const runtime = "nodejs";

/** GET /api/patches?synth=slug returns full patch states for the account library of that synth. */
export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const db = await serverDatabase();
  const synth = new URL(request.url).searchParams.get("synth");
  if (synth) return NextResponse.json({ patches: await listOwnPatchStates(db, user, synth) });
  return NextResponse.json({ patches: await listOwnPatches(db, user) });
}

export async function POST(request: Request) {
  const originFailure = rejectCrossOriginMutation(request);
  if (originFailure) return originFailure;
  const user = await requireUser();
  if (!user) return unauthorized();
  const parsed = await readJsonLimited(request, 1024 * 1024);
  if (!parsed.ok) return invalidJsonResponse(parsed.reason);
  const result = await createPatch(await serverDatabase(), user, parsed.value);
  if (!result.ok) return failureResponse(result);
  return NextResponse.json(result, { status: 201 });
}
