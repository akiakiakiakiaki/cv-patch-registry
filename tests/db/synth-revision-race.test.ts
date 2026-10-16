// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { closeDatabase, createDatabase, ensureDatabase, type DatabaseHandle } from "@/lib/db/client";
import { synthRevisions, synths, user } from "@/lib/db/schema";
import { appendSynthRevision } from "@/lib/repositories/synths-repository";

const handles: DatabaseHandle[] = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => closeDatabase(handle)));
});

describe("concurrent synth revisions", () => {
  it("allows only one writer from the same expected revision", async () => {
    const handle = createDatabase("memory://");
    handles.push(handle);
    await ensureDatabase(handle);

    const ownerId = randomUUID();
    const synthId = randomUUID();
    const revisionOneId = randomUUID();
    const revisionTwoIds = [randomUUID(), randomUUID()];
    await handle.db.insert(user).values({ id: ownerId, name: "Owner", email: `${ownerId}@example.test` });
    await handle.db.insert(synths).values({
      id: synthId,
      ownerId,
      slug: `race-${synthId}`,
      displayName: "Race synth",
      currentRevisionId: revisionOneId,
    });
    await handle.db.insert(synthRevisions).values({
      id: revisionOneId,
      synthId,
      number: 1,
      panelSource: "bundled",
      panelBundledSrc: "/panel.svg",
      layout: {},
      schemaVersion: 1,
      schemaMinor: 0,
    });

    const outcomes = await Promise.all(
      revisionTwoIds.map((id, index) =>
        appendSynthRevision(handle.db, {
          synthId,
          ownerId,
          expectedRevisionId: revisionOneId,
          synth: { displayName: `Writer ${index + 1}`, manufacturer: null },
          revision: {
            id,
            synthId,
            number: 2,
            panelSource: "bundled",
            panelBundledSrc: "/panel.svg",
            layout: { writer: index + 1 },
            schemaVersion: 1,
            schemaMinor: 0,
          },
        }),
      ),
    );

    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(outcomes.filter((outcome) => !outcome)).toHaveLength(1);
    const [current] = await handle.db.select().from(synths).where(eq(synths.id, synthId));
    const revisions = await handle.db.select().from(synthRevisions).where(eq(synthRevisions.synthId, synthId));
    expect(revisions).toHaveLength(2);
    expect(current?.currentRevisionId).toBe(revisions.find((revision) => revision.number === 2)?.id);
  }, 20_000);
});
