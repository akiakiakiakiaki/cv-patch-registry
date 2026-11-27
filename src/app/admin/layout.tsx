import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { requireUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/domain/policy";

// Depends on the signed-in user: rendered per request, never at build time.
export const dynamic = "force-dynamic";

/** Admins only; everyone else gets "not found", so the area does not reveal itself. */
export default async function Layout({ children }: { children: ReactNode }) {
  if (!isAdmin(await requireUser())) notFound();
  return <AdminLayout>{children}</AdminLayout>;
}
