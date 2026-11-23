import { NextResponse } from "next/server";
import { storePanelUpload } from "@/lib/assets/asset-service";
import { SVG_MAX_BYTES } from "@/lib/assets/svg-sanitizer";
import { serverDatabase } from "@/lib/db/server";
import { canUploadAsset } from "@/lib/domain/policy";
import { getStorage } from "@/lib/storage";
import { readBodyLimited } from "@/lib/http/read-limited";
import { requireUser } from "@/lib/auth/session";
import { hasCapability, roleForUser } from "@/lib/auth/roles";
import { rejectCrossOriginMutation } from "@/lib/http/mutation-origin";

export const runtime = "nodejs";

/** Raw body upload: POST /api/assets?kind=panel. The file type is decided from the bytes. */
export async function POST(request: Request) {
  const originFailure = rejectCrossOriginMutation(request);
  if (originFailure) return originFailure;
  const user = await requireUser();
  if (!user || !hasCapability(roleForUser(user), "manageSynths") || !canUploadAsset(user)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const kind = new URL(request.url).searchParams.get("kind");
  if (kind !== "panel") return NextResponse.json({ error: "unsupported-kind" }, { status: 400 });

  const bytes = await readBodyLimited(request, SVG_MAX_BYTES);
  if (!bytes) return NextResponse.json({ error: "too-large" }, { status: 413 });

  try {
    const result = await storePanelUpload({ db: await serverDatabase(), storage: getStorage() }, user, bytes);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 422 });
    return NextResponse.json({ panel: result.panel }, { status: 201 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown upload error";
    console.error("[api/assets] Panel upload failed:", detail);
    return NextResponse.json({ error: "upload-failed" }, { status: 500 });
  }
}
