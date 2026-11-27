import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { serverDatabase } from "@/lib/db/server";
import { rejectCrossOriginMutation } from "@/lib/http/mutation-origin";
import { getStorage } from "@/lib/storage";
import { reduceRevisions } from "@/lib/synths/synth-admin";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

/** Admins only: removes old revisions nothing needs anymore (see reduceRevisions). */
export async function DELETE(request: Request, { params }: RouteContext) {
  const originFailure = rejectCrossOriginMutation(request);
  if (originFailure) return originFailure;
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { slug } = await params;
  const result = await reduceRevisions({ db: await serverDatabase(), storage: getStorage() }, user, slug);
  if (result.ok) return NextResponse.json(result);
  return NextResponse.json({ error: result.error }, { status: result.error === "forbidden" ? 403 : 404 });
}
