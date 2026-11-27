import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/domain/policy";
import { rejectCrossOriginMutation } from "@/lib/http/mutation-origin";
import { readBodyLimited } from "@/lib/http/read-limited";
import { getStorage } from "@/lib/storage";
import { LocalFsStorage } from "@/lib/storage/local-fs-storage";
import { isValidUploadKey } from "@/lib/storage/upload-url";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ key: string }> };

/** The largest file a backup holds (panels up to 5 MB, samples far smaller). */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Admins only, local file storage only: stores one of a backup's files under its key. With Supabase the browser
 * uploads straight to Supabase instead (see SupabaseStorage.uploadTarget).
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const originFailure = rejectCrossOriginMutation(request);
  if (originFailure) return originFailure;
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const storage = getStorage();
  if (!(storage instanceof LocalFsStorage)) return NextResponse.json({ error: "not-found" }, { status: 404 });

  const { key } = await params;
  if (!isValidUploadKey(key)) return NextResponse.json({ error: "invalid" }, { status: 422 });
  const bytes = await readBodyLimited(request, MAX_BYTES);
  if (!bytes) return NextResponse.json({ error: "too-large" }, { status: 413 });
  await storage.putAt(key, bytes);
  return new NextResponse(null, { status: 204 });
}
