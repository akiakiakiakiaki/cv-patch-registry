import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/domain/policy";
import { invalidJsonResponse } from "@/lib/http/patch-responses";
import { readJsonLimited } from "@/lib/http/read-json-limited";
import { rejectCrossOriginMutation } from "@/lib/http/mutation-origin";
import { getStorage } from "@/lib/storage";
import { isValidUploadKey } from "@/lib/storage/upload-url";

export const runtime = "nodejs";

const targetsSchema = z.object({ keys: z.array(z.string().refine(isValidUploadKey)).min(1).max(200) });

/** Admins only: where the browser uploads each of a backup's files (see StorageProvider.uploadTarget). */
export async function POST(request: Request) {
  const originFailure = rejectCrossOriginMutation(request);
  if (originFailure) return originFailure;
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await readJsonLimited(request, 64 * 1024);
  if (!parsed.ok) return invalidJsonResponse(parsed.reason);
  const body = targetsSchema.safeParse(parsed.value);
  if (!body.success) return NextResponse.json({ error: "invalid" }, { status: 422 });

  const storage = getStorage();
  const entries = await Promise.all(body.data.keys.map(async (key) => [key, await storage.uploadTarget(key)] as const));
  return NextResponse.json({ targets: Object.fromEntries(entries) });
}
