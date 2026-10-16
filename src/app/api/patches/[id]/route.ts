import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { serverDatabase } from "@/lib/db/server";
import { failureResponse, invalidJsonResponse, unauthorized } from "@/lib/http/patch-responses";
import { readJsonLimited } from "@/lib/http/read-json-limited";
import { rejectCrossOriginMutation } from "@/lib/http/mutation-origin";
import { deletePatch, getPatchView, updatePatch } from "@/lib/patches/patch-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** Public patches are readable anonymously; private ones answer 404 to everyone but the owner. */
export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const user = await requireUser();
  const view = await getPatchView(await serverDatabase(), user, id);
  if (!view) return NextResponse.json({ error: "not-found" }, { status: 404 });
  return NextResponse.json(view);
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const originFailure = rejectCrossOriginMutation(request);
  if (originFailure) return originFailure;
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const parsed = await readJsonLimited(request, 1024 * 1024);
  if (!parsed.ok) return invalidJsonResponse(parsed.reason);
  const result = await updatePatch(await serverDatabase(), user, id, parsed.value);
  if (!result.ok) return failureResponse(result);
  return NextResponse.json(result);
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const originFailure = rejectCrossOriginMutation(request);
  if (originFailure) return originFailure;
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const result = await deletePatch(await serverDatabase(), user, id);
  if (!result.ok) return failureResponse(result);
  return new NextResponse(null, { status: 204 });
}
