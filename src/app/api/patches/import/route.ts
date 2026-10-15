import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { serverDatabase } from "@/lib/db/server";
import { failureResponse, readJson, unauthorized } from "@/lib/http/patch-responses";
import { importLocalPatches } from "@/lib/patches/patch-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const body = await readJson(request);
  if (body === undefined) return NextResponse.json({ error: "invalid" }, { status: 422 });
  const result = await importLocalPatches(await serverDatabase(), user, body);
  if (!result.ok) return failureResponse(result);
  return NextResponse.json(result, { status: 201 });
}
