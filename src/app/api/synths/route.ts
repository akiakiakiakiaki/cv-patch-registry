import { NextResponse } from "next/server";
import { serverDatabase } from "@/lib/db/server";
import { requireUser } from "@/lib/auth/session";
import { createSynth, listSynthViews } from "@/lib/synths/synth-service";
import { hasCapability, roleForUser } from "@/lib/auth/roles";
import { invalidJsonResponse } from "@/lib/http/patch-responses";
import { readJsonLimited } from "@/lib/http/read-json-limited";
import { rejectCrossOriginMutation } from "@/lib/http/mutation-origin";

export const runtime = "nodejs";

export async function GET() {
  const views = await listSynthViews(await serverDatabase());
  return NextResponse.json({
    synths: views.map(({ slug, displayName, manufacturer, revision, isBuiltIn }) => ({
      slug,
      displayName,
      manufacturer,
      revision,
      isBuiltIn,
    })),
  });
}

export async function POST(request: Request) {
  const originFailure = rejectCrossOriginMutation(request);
  if (originFailure) return originFailure;
  const user = await requireUser();
  if (!user || !hasCapability(roleForUser(user), "manageSynths")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = await readJsonLimited(request, 1024 * 1024);
  if (!parsed.ok) return invalidJsonResponse(parsed.reason);

  const result = await createSynth(await serverDatabase(), user, parsed.value);
  if (result.ok) return NextResponse.json(result, { status: 201 });
  if (result.error === "invalid") return NextResponse.json(result, { status: 422 });
  if (result.error === "slug-taken") return NextResponse.json({ error: result.error }, { status: 409 });
  if (result.error === "panel") return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ error: result.error }, { status: 404 });
}
