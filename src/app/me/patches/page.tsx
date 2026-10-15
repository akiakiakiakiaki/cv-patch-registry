import { redirect } from "next/navigation";

/** The patch list lives on the start page. */
export default function MyPatchesPage() {
  redirect("/");
}
