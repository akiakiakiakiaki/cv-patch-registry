import { notFound } from "next/navigation";
import { SampleAdminList } from "@/components/admin/SampleAdminList";
import { requireUser } from "@/lib/auth/session";
import { serverDatabase } from "@/lib/db/server";
import { listSampleGroups } from "@/lib/samples/sample-admin";

/** Sample overview: every sample file by synth, unused ones marked (admins only, see the admin layout). */
export default async function SampleAdminPage() {
  const groups = await listSampleGroups(await serverDatabase(), await requireUser());
  if (!groups) notFound();
  return <SampleAdminList groups={groups} />;
}
