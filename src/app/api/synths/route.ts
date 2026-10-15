import { NextResponse } from "next/server";
import { serverDatabase } from "@/lib/db/server";
import { requireUser } from "@/lib/auth/session";
import { createSynth, listSynthViews } from "@/lib/synths/synth-service";

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
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 422 });
  }

  const result = await createSynth(await serverDatabase(), user, body);
  if (result.ok) return NextResponse.json(result, { status: 201 });
  if (result.error === "invalid") return NextResponse.json(result, { status: 422 });
  if (result.error === "slug-taken") return NextResponse.json({ error: result.error }, { status: 409 });
  if (result.error === "panel") return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ error: result.error }, { status: 404 });
}
