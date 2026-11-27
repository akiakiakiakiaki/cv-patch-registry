import { notFound } from "next/navigation";
import { UserAdminList } from "@/components/admin/UserAdminList";
import { requireUser } from "@/lib/auth/session";
import { serverDatabase } from "@/lib/db/server";
import { listUsersForAdminArea } from "@/lib/users/user-admin";

/** User management: activate, confirm email, set roles (admins only, see the admin layout). */
export default async function UserAdminPage() {
  const items = await listUsersForAdminArea(await serverDatabase(), await requireUser());
  if (!items) notFound();
  return <UserAdminList items={items} />;
}
