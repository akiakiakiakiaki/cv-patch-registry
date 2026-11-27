import { notFound } from "next/navigation";
import { PatchAdminList } from "@/components/admin/PatchAdminList";
import { requireUser } from "@/lib/auth/session";
import { serverDatabase } from "@/lib/db/server";
import { listPatchGroups } from "@/lib/patches/patch-admin";

/** Patch overview: every patch by synth, read-only (admins only, see the admin layout). */
export default async function PatchAdminPage() {
  const groups = await listPatchGroups(await serverDatabase(), await requireUser());
  if (!groups) notFound();
  return <PatchAdminList groups={groups} />;
}
