import { serverDatabase } from "@/lib/db/server";
import { listPublicPatches } from "@/lib/patches/patch-service";
import { listSynthViews } from "@/lib/synths/synth-service";
import { ExploreView } from "@/components/patch-views/ExploreView";

type PageProps = { searchParams: Promise<{ tag?: string; synth?: string }> };

/** Public page: no login needed. */
export default async function ExplorePage({ searchParams }: PageProps) {
  const { tag, synth } = await searchParams;
  const db = await serverDatabase();
  const [patches, synths] = await Promise.all([
    listPublicPatches(db, { tagSlug: tag, synthSlug: synth }),
    listSynthViews(db),
  ]);
  return (
    <ExploreView
      patches={patches}
      activeTag={tag ?? null}
      activeSynth={synth ?? null}
      synths={synths.map((view) => ({ slug: view.slug, displayName: view.displayName }))}
    />
  );
}
