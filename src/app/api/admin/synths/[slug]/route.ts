import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { serverDatabase } from "@/lib/db/server";
import { invalidJsonResponse } from "@/lib/http/patch-responses";
import { readJsonLimited } from "@/lib/http/read-json-limited";
import { rejectCrossOriginMutation } from "@/lib/http/mutation-origin";
import { getStorage } from "@/lib/storage";
import { purgeSynth, setApproval, setDeleted, type AdminFailure } from "@/lib/synths/synth-admin";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

/** One change per request: approve (or take back), or delete softly (or restore). */
const changeSchema = z.union([z.object({ approved: z.boolean() }).strict(), z.object({ deleted: z.boolean() }).strict()]);

function failure(result: AdminFailure | { ok: false; error: "not-deleted" }) {
  const status = result.error === "forbidden" ? 403 : result.error === "not-deleted" ? 409 : 404;
  return NextResponse.json({ error: result.error }, { status });
}

/** Admins only: { approved } approves a synth or takes it back; { deleted } deletes it softly or restores it. */
export async function PATCH(request: Request, { params }: RouteContext) {
  const originFailure = rejectCrossOriginMutation(request);
  if (originFailure) return originFailure;
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = await readJsonLimited(request, 1024);
  if (!parsed.ok) return invalidJsonResponse(parsed.reason);
  const body = changeSchema.safeParse(parsed.value);
  if (!body.success) return NextResponse.json({ error: "invalid" }, { status: 422 });

  const { slug } = await params;
  const db = await serverDatabase();
  const result = "approved" in body.data ? await setApproval(db, user, slug, body.data.approved) : await setDeleted(db, user, slug, body.data.deleted);
  return result.ok ? NextResponse.json(result) : failure(result);
}

/** Admins only: removes a soft-deleted synth for good, with every patch on it and its files. */
export async function DELETE(request: Request, { params }: RouteContext) {
  const originFailure = rejectCrossOriginMutation(request);
  if (originFailure) return originFailure;
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { slug } = await params;
  const result = await purgeSynth({ db: await serverDatabase(), storage: getStorage() }, user, slug);
  return result.ok ? new NextResponse(null, { status: 204 }) : failure(result);
}
