import { NextResponse } from "next/server";
import { serverDatabase } from "@/lib/db/server";
import { requireUser } from "@/lib/auth/session";
import { failureResponse, readJson, unauthorized } from "@/lib/http/patch-responses";
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
  const user = await requireUser();
  if (!user) return unauthorized();
  const body = await readJson(request);
  if (body === undefined) return NextResponse.json({ error: "invalid" }, { status: 422 });
  const result = await createPatch(await serverDatabase(), user, body);
  if (!result.ok) return failureResponse(result);
  return NextResponse.json(result, { status: 201 });
}
