import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { encodeInstrumentLayout } from "@/lib/adapters/instrument-layout-adapter";
import { canonicalJson } from "@/lib/domain/canonical-json";
import type { Database } from "@/lib/db/client";
import { synthRevisions, synths } from "@/lib/db/schema";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import { seedCuratedTags } from "@/lib/repositories/tags-repository";

const BUILT_IN_PANEL_SRC = "/proton.svg";

/**
 * Mirrors the built-in layout file into the synth catalog. A new revision is written only when the
 * file content differs from the latest revision, so repeated starts change nothing.
 */
export async function seedBuiltInSynths(db: Database): Promise<void> {
  await seedCuratedTags(db);
  const layout = encodeInstrumentLayout(behringerProton.layout);
  const slug = layout.id;

  await db.transaction(async (tx) => {
    await tx
      .insert(synths)
      .values({ id: randomUUID(), ownerId: null, slug, displayName: layout.displayName })
      .onConflictDoNothing({ target: synths.slug });

    const [synth] = await tx.select().from(synths).where(eq(synths.slug, slug)).for("update");
    if (!synth || synth.ownerId !== null) throw new Error("Built-in synth could not be created");

    const [latest] = await tx
      .select()
      .from(synthRevisions)
      .where(eq(synthRevisions.synthId, synth.id))
      .orderBy(desc(synthRevisions.number))
      .limit(1);

    if (latest && canonicalJson(latest.layout) === canonicalJson(layout)) {
      if (synth.currentRevisionId !== latest.id) {
        await tx.update(synths).set({ currentRevisionId: latest.id, updatedAt: new Date() }).where(eq(synths.id, synth.id));
      }
      return;
    }

    const revisionId = randomUUID();
    await tx.insert(synthRevisions).values({
      id: revisionId,
      synthId: synth.id,
      number: (latest?.number ?? 0) + 1,
      panelSource: "bundled",
      panelBundledSrc: BUILT_IN_PANEL_SRC,
      layout,
      schemaVersion: layout.schemaVersion,
      schemaMinor: layout.schemaMinor ?? 0,
    });
    await tx
      .update(synths)
      .set({ currentRevisionId: revisionId, updatedAt: new Date() })
      .where(eq(synths.id, synth.id));
  });
}
