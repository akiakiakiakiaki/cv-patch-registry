import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { encodeInstrumentLayout } from "@/lib/adapters/instrument-layout-adapter";
import { canonicalJson } from "@/lib/domain/canonical-json";
import type { Database } from "@/lib/db/client";
import { synths } from "@/lib/db/schema";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import { seedCuratedTags } from "@/lib/repositories/tags-repository";
import { findLatestRevision, findSynthBySlug, insertRevision, insertSynth } from "@/lib/repositories/synths-repository";

const BUILT_IN_PANEL_SRC = "/proton.svg";

/**
 * Mirrors the built-in layout file into the synth catalog. A new revision is written only when the
 * file content differs from the latest revision, so repeated starts change nothing.
 */
export async function seedBuiltInSynths(db: Database): Promise<void> {
  await seedCuratedTags(db);
  const layout = encodeInstrumentLayout(behringerProton.layout);
  const slug = layout.id;

  let synth = await findSynthBySlug(db, slug);
  if (!synth) {
    await insertSynth(db, { id: randomUUID(), ownerId: null, slug, displayName: layout.displayName });
    synth = await findSynthBySlug(db, slug);
  }
  if (!synth) throw new Error("Built-in synth could not be created");

  const latest = await findLatestRevision(db, synth.id);
  if (latest && canonicalJson(latest.layout) === canonicalJson(layout)) return;

  const revisionId = randomUUID();
  await insertRevision(db, {
    id: revisionId,
    synthId: synth.id,
    number: (latest?.number ?? 0) + 1,
    panelSource: "bundled",
    panelBundledSrc: BUILT_IN_PANEL_SRC,
    layout,
    schemaVersion: layout.schemaVersion,
    schemaMinor: layout.schemaMinor ?? 0,
  });
  await db
    .update(synths)
    .set({ currentRevisionId: revisionId, updatedAt: new Date() })
    .where(eq(synths.id, synth.id));
}
