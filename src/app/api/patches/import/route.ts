import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { serverDatabase } from "@/lib/db/server";
import { failureResponse, invalidJsonResponse, unauthorized } from "@/lib/http/patch-responses";
import { readJsonLimited } from "@/lib/http/read-json-limited";
import { rejectCrossOriginMutation } from "@/lib/http/mutation-origin";
import { importLocalPatches } from "@/lib/patches/patch-service";
import { hasCapability, roleForUser } from "@/lib/auth/roles";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const originFailure = rejectCrossOriginMutation(request);
  if (originFailure) return originFailure;
  const user = await requireUser();
  if (!user || !hasCapability(roleForUser(user), "importExportPatches")) return unauthorized();
  const parsed = await readJsonLimited(request, 5 * 1024 * 1024);
  if (!parsed.ok) return invalidJsonResponse(parsed.reason);
  const result = await importLocalPatches(await serverDatabase(), user, parsed.value);
  if (!result.ok) return failureResponse(result);
  return NextResponse.json(result, { status: 201 });
}
