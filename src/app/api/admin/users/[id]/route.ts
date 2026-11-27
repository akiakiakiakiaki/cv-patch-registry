import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { serverDatabase } from "@/lib/db/server";
import { invalidJsonResponse } from "@/lib/http/patch-responses";
import { readJsonLimited } from "@/lib/http/read-json-limited";
import { rejectCrossOriginMutation } from "@/lib/http/mutation-origin";
import { changeUser } from "@/lib/users/user-admin";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** One change per request. The owner role is never assigned here. */
const changeSchema = z.union([
  z.object({ active: z.boolean() }).strict(),
  z.object({ emailVerified: z.boolean() }).strict(),
  z.object({ role: z.enum(["user", "admin"]) }).strict(),
]);

/** Admins only: activates or deactivates an account, marks its email verified, or (owner only) sets its role. */
export async function PATCH(request: Request, { params }: RouteContext) {
  const originFailure = rejectCrossOriginMutation(request);
  if (originFailure) return originFailure;
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = await readJsonLimited(request, 1024);
  if (!parsed.ok) return invalidJsonResponse(parsed.reason);
  const body = changeSchema.safeParse(parsed.value);
  if (!body.success) return NextResponse.json({ error: "invalid" }, { status: 422 });

  const { id } = await params;
  const result = await changeUser(await serverDatabase(), user, id, body.data);
  if (result.ok) return NextResponse.json(result.change);
  return NextResponse.json({ error: result.error }, { status: result.error === "forbidden" ? 403 : 404 });
}
