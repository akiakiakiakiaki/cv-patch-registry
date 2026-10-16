import { NextResponse } from "next/server";
import { SAMPLE_MAX_BYTES, audioEnabled } from "@/lib/audio/sample-rules";
import { requireUser } from "@/lib/auth/session";
import { serverDatabase } from "@/lib/db/server";
import { readBodyLimited } from "@/lib/http/read-limited";
import { attachSample, type SampleFailure } from "@/lib/patches/sample-service";
import { getStorage } from "@/lib/storage";
import { rejectCrossOriginMutation } from "@/lib/http/mutation-origin";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const STATUS: Record<SampleFailure["error"], number> = {
  disabled: 404,
  "not-found": 404,
  "sample-exists": 409,
  invalid: 422,
  "unsupported-type": 422,
  "too-large": 413,
  quota: 422,
};

/** Raw MP3 body. Title, license and the rights confirmation travel in the query string. */
export async function POST(request: Request, { params }: RouteContext) {
  const originFailure = rejectCrossOriginMutation(request);
  if (originFailure) return originFailure;
  if (!audioEnabled()) return NextResponse.json({ error: "not-found" }, { status: 404 });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const bytes = await readBodyLimited(request, SAMPLE_MAX_BYTES);
  if (!bytes) return NextResponse.json({ error: "too-large" }, { status: 413 });

  const result = await attachSample(
    { db: await serverDatabase(), storage: getStorage() },
    user,
    id,
    bytes,
    {
      title: query.get("title") ?? "",
      license: query.get("license") ?? "",
      rightsConfirmed: query.get("rights") === "true",
    },
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] });
  return NextResponse.json(result, { status: 201 });
}
