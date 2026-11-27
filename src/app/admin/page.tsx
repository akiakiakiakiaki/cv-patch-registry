import { redirect } from "next/navigation";

/** The admin area opens with its first section. */
export default function AdminPage() {
  redirect("/admin/synths");
}
