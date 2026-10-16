import { NextResponse } from "next/server";
import { serverDatabase } from "@/lib/db/server";
import { requireUser } from "@/lib/auth/session";
import { createSynthRevision } from "@/lib/synths/synth-service";
import { hasCapability, roleForUser } from "@/lib/auth/roles";
import { invalidJsonResponse } from "@/lib/http/patch-responses";
import { readJsonLimited } from "@/lib/http/read-json-limited";
import { rejectCrossOriginMutation } from "@/lib/http/mutation-origin";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const originFailure = rejectCrossOriginMutation(request);
  if (originFailure) return originFailure;
  const user = await requireUser();
  if (!user || !hasCapability(roleForUser(user), "manageSynths")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const parsed = await readJsonLimited(request, 1024 * 1024);
  if (!parsed.ok) return invalidJsonResponse(parsed.reason);

  const result = await createSynthRevision(await serverDatabase(), user, slug, parsed.value);
  if (result.ok) return NextResponse.json(result, { status: 201 });
  if (result.error === "conflict") return NextResponse.json({ error: "conflict" }, { status: 409 });
  if (result.error === "invalid") return NextResponse.json(result, { status: 422 });
  if (result.error === "panel") return NextResponse.json({ error: "panel" }, { status: 422 });
  return NextResponse.json({ error: "not-found" }, { status: 404 });
}
