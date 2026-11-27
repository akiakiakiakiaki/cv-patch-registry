import { NextResponse } from "next/server";
import { serverDatabase } from "@/lib/db/server";
import { requireUser } from "@/lib/auth/session";
import { createSynth, getSynthView, listSynthViews } from "@/lib/synths/synth-service";
import { hasCapability, roleForUser } from "@/lib/auth/roles";
import { invalidJsonResponse } from "@/lib/http/patch-responses";
import { readJsonLimited } from "@/lib/http/read-json-limited";
import { rejectCrossOriginMutation } from "@/lib/http/mutation-origin";
import type { Database } from "@/lib/db/client";
import { getMailer } from "@/lib/mail/mailer";
import { notifyAdminsOfPendingSynth } from "@/lib/synths/synth-notifications";

export const runtime = "nodejs";

/** The synths the requesting user may see: approved ones, plus their own (and for admins all) unapproved ones. */
export async function GET() {
  const views = await listSynthViews(await serverDatabase(), await requireUser());
  return NextResponse.json({
    synths: views.map(({ slug, displayName, manufacturer, revision, isBuiltIn, approved }) => ({
      slug,
      displayName,
      manufacturer,
      revision,
      isBuiltIn,
      approved,
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

  const db = await serverDatabase();
  const result = await createSynth(db, user, parsed.value);
  if (result.ok) {
    await notifyAdmins(db, user, result.slug, new URL(request.url).origin);
    return NextResponse.json(result, { status: 201 });
  }
  if (result.error === "invalid") return NextResponse.json(result, { status: 422 });
  if (result.error === "slug-taken") return NextResponse.json({ error: result.error }, { status: 409 });
  if (result.error === "panel") return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ error: result.error }, { status: 404 });
}

/** A new synth waits for approval: admins hear about it. A mail problem never fails the creation. */
async function notifyAdmins(db: Database, user: { id: string; name: string; email: string }, slug: string, origin: string) {
  try {
    const view = await getSynthView(db, slug, user);
    const result = await notifyAdminsOfPendingSynth(db, getMailer(), {
      synthName: view?.displayName ?? slug,
      creator: user,
      reviewUrl: `${origin}/admin/synths`,
    });
    if (result.failed) console.error(`Approval notification failed for ${result.failed} admin(s)`);
  } catch (error) {
    console.error("Approval notification failed:", error instanceof Error ? error.message : error);
  }
}

