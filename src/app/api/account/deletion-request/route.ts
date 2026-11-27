import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { serverDatabase } from "@/lib/db/server";
import { rejectCrossOriginMutation } from "@/lib/http/mutation-origin";
import { getMailer } from "@/lib/mail/mailer";
import { requestAccountDeletion } from "@/lib/users/deletion-request";

export const runtime = "nodejs";

const FAILURE_STATUS = { forbidden: 403, "not-found": 404, "mail-failed": 502 } as const;

/** The signed-in user asks for their account to be deleted; it is deactivated right away (see requestAccountDeletion). */
export async function POST(request: Request) {
  const originFailure = rejectCrossOriginMutation(request);
  if (originFailure) return originFailure;
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await requestAccountDeletion(
    { db: await serverDatabase(), mailer: getMailer() },
    user.id,
    `${new URL(request.url).origin}/admin/users`,
  );
  if (result.ok) return new NextResponse(null, { status: 204 });
  return NextResponse.json({ error: result.error }, { status: FAILURE_STATUS[result.error] });
}
