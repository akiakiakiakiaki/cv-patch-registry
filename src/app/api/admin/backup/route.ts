import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { exportBackupData } from "@/lib/backup/backup-service";
import { serverDatabase } from "@/lib/db/server";
import { isAdmin } from "@/lib/domain/policy";
import { storagePublicUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admins only: the database part of a backup, plus where the browser fetches each file. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const data = await exportBackupData(await serverDatabase());
  const fileUrls = Object.fromEntries(data.manifest.files.map((key) => [key, storagePublicUrl(key)]));
  return NextResponse.json({ ...data, fileUrls }, { headers: { "Cache-Control": "no-store" } });
}
