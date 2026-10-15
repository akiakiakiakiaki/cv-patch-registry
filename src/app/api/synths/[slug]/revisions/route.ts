import { NextResponse } from "next/server";
import { serverDatabase } from "@/lib/db/server";
import { requireUser } from "@/lib/auth/session";
import { createSynthRevision } from "@/lib/synths/synth-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { slug } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 422 });
  }

  const result = await createSynthRevision(await serverDatabase(), user, slug, body);
  if (result.ok) return NextResponse.json(result, { status: 201 });
  if (result.error === "conflict") return NextResponse.json({ error: "conflict" }, { status: 409 });
  if (result.error === "invalid") return NextResponse.json(result, { status: 422 });
  if (result.error === "panel") return NextResponse.json({ error: "panel" }, { status: 422 });
  return NextResponse.json({ error: "not-found" }, { status: 404 });
}
