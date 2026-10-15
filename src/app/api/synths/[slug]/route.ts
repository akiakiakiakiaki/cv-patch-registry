import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { serverDatabase } from "@/lib/db/server";
import { deleteSynth } from "@/lib/synths/synth-delete";
import { getSynthView } from "@/lib/synths/synth-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { slug } = await params;
  const view = await getSynthView(await serverDatabase(), slug);
  if (!view) return NextResponse.json({ error: "not-found" }, { status: 404 });
  return NextResponse.json(view);
}

/** Owner only. Flags the synth as deleted (soft delete). */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { slug } = await params;
  const result = await deleteSynth(await serverDatabase(), user, slug);
  if (!result.ok) return NextResponse.json({ error: "not-found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
