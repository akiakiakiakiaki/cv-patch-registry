import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { BACKUP_TABLES } from "@/lib/backup/backup-format";
import { restoreBackupData } from "@/lib/backup/backup-service";
import { serverDatabase } from "@/lib/db/server";
import { isAdmin } from "@/lib/domain/policy";
import { invalidJsonResponse } from "@/lib/http/patch-responses";
import { readJsonLimited } from "@/lib/http/read-json-limited";
import { rejectCrossOriginMutation } from "@/lib/http/mutation-origin";

export const runtime = "nodejs";

/** Function payloads on Vercel are limited to 4.5 MB; the files themselves never pass through here. */
const MAX_BYTES = 4 * 1024 * 1024;

const rows = z.array(z.record(z.string(), z.unknown()));
const restoreSchema = z.object({
  manifest: z.object({ migrations: z.number().int().min(0) }).passthrough(),
  tables: z.object(Object.fromEntries(BACKUP_TABLES.map((table) => [table, rows])) as Record<(typeof BACKUP_TABLES)[number], typeof rows>),
});

/**
 * Admins only: replaces the whole database with a backup's data (see restoreBackupData). Its files must be
 * uploaded first. Everyone, the admin included, is signed out afterwards.
 */
export async function POST(request: Request) {
  const originFailure = rejectCrossOriginMutation(request);
  if (originFailure) return originFailure;
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = await readJsonLimited(request, MAX_BYTES);
  if (!parsed.ok) return invalidJsonResponse(parsed.reason);
  const body = restoreSchema.safeParse(parsed.value);
  if (!body.success) return NextResponse.json({ error: "invalid" }, { status: 422 });

  const result = await restoreBackupData(await serverDatabase(), body.data);
  if (!result.ok) return NextResponse.json(result, { status: 409 });
  return NextResponse.json({ ok: true });
}
