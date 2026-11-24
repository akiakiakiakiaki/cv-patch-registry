import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { serverDatabase } from "@/lib/db/server";
import { suggestTags } from "@/lib/repositories/tags-repository";

export const runtime = "nodejs";

const SUGGESTION_LIMIT = 10;
const MAX_QUERY_LENGTH = 32;

/**
 * GET /api/tags?q=… suggests existing tags while typing: curated tags, tags of public patches and, when signed in,
 * the user's own tags. Tags only used on other people's private patches are never returned.
 */
export async function GET(request: Request) {
  const user = await requireUser();
  const query = (new URL(request.url).searchParams.get("q") ?? "").slice(0, MAX_QUERY_LENGTH);
  const tags = await suggestTags(await serverDatabase(), { query, ownerId: user?.id ?? null, limit: SUGGESTION_LIMIT });
  return NextResponse.json({ tags });
}
