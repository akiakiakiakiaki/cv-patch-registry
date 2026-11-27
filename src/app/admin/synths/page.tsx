import { notFound } from "next/navigation";
import { SynthAdminList } from "@/components/admin/SynthAdminList";
import { requireUser } from "@/lib/auth/session";
import { serverDatabase } from "@/lib/db/server";
import { listSynthsForAdminArea } from "@/lib/synths/synth-admin";

/** Synth management: approve, delete or restore, reduce revisions, remove for good (admins only, see the admin layout). */
export default async function SynthAdminPage() {
  const items = await listSynthsForAdminArea(await serverDatabase(), await requireUser());
  if (!items) notFound();
  return <SynthAdminList items={items} />;
}
