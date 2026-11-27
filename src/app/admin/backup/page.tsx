import { notFound } from "next/navigation";
import { BackupAdminPanel } from "@/components/admin/BackupAdminPanel";
import { requireUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/domain/policy";

/** Import/Export: complete backups of data and files (admins only, see the admin layout). */
export default async function BackupAdminPage() {
  if (!isAdmin(await requireUser())) notFound();
  return <BackupAdminPanel />;
}
