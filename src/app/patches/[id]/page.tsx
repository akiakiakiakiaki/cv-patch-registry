import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { serverDatabase } from "@/lib/db/server";
import { getPatchView } from "@/lib/patches/patch-service";

type PageProps = { params: Promise<{ id: string }> };

/** Patches live on the start page now. Old and shared links open the patch there. */
export default async function PatchPage({ params }: PageProps) {
  const { id } = await params;
  const view = await getPatchView(await serverDatabase(), await requireUser(), id);
  if (!view) notFound();
  redirect(`/?synth=${encodeURIComponent(view.synth.slug)}&patch=${encodeURIComponent(view.id)}`);
}
