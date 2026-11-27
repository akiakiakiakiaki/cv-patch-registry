import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, ensureDatabase, type Database } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { synths, tags, user } from "@/lib/db/schema";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import { createPatch, getPatchView, listOwnPatchStates, listPublicPatches, updatePatch } from "@/lib/patches/patch-service";
import { capitalizeTagLabels, suggestTags } from "@/lib/repositories/tags-repository";

const SYNTH = behringerProton.id;
let db: Database;
let close: () => Promise<void>;
const me = { id: randomUUID() };
const other = { id: randomUUID() };

beforeEach(async () => {
  const handle = createDatabase("memory://");
  await ensureDatabase(handle);
  db = handle.db;
  close = () => handle.client.close();
  await db.insert(user).values([
    { id: me.id, name: "Me", email: `${me.id}@example.test`, emailVerified: true },
    { id: other.id, name: "Other", email: `${other.id}@example.test`, emailVerified: true },
  ]);
});

afterEach(async () => {
  await close();
});

const labelOf = async (slug: string) => (await db.select().from(tags)).find((tag) => tag.slug === slug)?.label;

describe("tag labels", () => {
  it("stores new tags with an uppercase start and keeps the first spelling of existing ones", async () => {
    await createPatch(db, me, { synthSlug: SYNTH, name: "One", tags: ["acid house", "TB-303", "fx"] });
    await createPatch(db, other, { synthSlug: SYNTH, name: "Two", tags: ["ACID HOUSE"] });
    expect(await labelOf("acid house")).toBe("Acid house");
    expect(await labelOf("tb-303")).toBe("TB-303");
    expect(await labelOf("fx")).toBe("FX");
  });

  it("returns labels next to slugs, in label order, in every patch response", async () => {
    const created = await createPatch(db, me, { synthSlug: SYNTH, name: "One", visibility: "public", tags: ["sequence", "acid", "TB-303"] });
    if (!created.ok) throw new Error("setup failed");
    const expected = { tags: ["acid", "sequence", "tb-303"], tagLabels: ["Acid", "Sequence", "TB-303"] };
    expect(await getPatchView(db, me, created.id)).toMatchObject(expected);
    expect((await listOwnPatchStates(db, me, SYNTH))[0]).toMatchObject(expected);
    expect((await listPublicPatches(db, {}))[0]).toMatchObject(expected);
  });

  it("accepts labels on update and keeps the patch's tags when none are sent", async () => {
    const created = await createPatch(db, me, { synthSlug: SYNTH, name: "One", tags: ["Acid"] });
    if (!created.ok) throw new Error("setup failed");
    await updatePatch(db, me, created.id, { name: "One", expectedRevision: 1, tags: ["Acid", "Noise"] });
    await updatePatch(db, me, created.id, { name: "Renamed", expectedRevision: 2 });
    expect(await getPatchView(db, me, created.id)).toMatchObject({ tags: ["acid", "noise"], tagLabels: ["Acid", "Noise"] });
  });
});

describe("suggestTags", () => {
  beforeEach(async () => {
    await createPatch(db, me, { synthSlug: SYNTH, name: "Mine", tags: ["My secret"] });
    await createPatch(db, other, { synthSlug: SYNTH, name: "Theirs public", visibility: "public", tags: ["Acid", "Acid house"] });
    await createPatch(db, other, { synthSlug: SYNTH, name: "Theirs private", tags: ["Their secret", "Acid"] });
  });

  const slugs = async (query: string, ownerId: string | null) =>
    (await suggestTags(db, { query, viewer: ownerId ? { id: ownerId } : null, limit: 20 })).map((tag) => tag.slug);

  it("offers curated tags, tags of public patches and the viewer's own, never other people's private tags", async () => {
    const mine = await slugs("", me.id);
    expect(mine).toEqual(expect.arrayContaining(["bass", "lead", "acid", "acid house", "my secret"]));
    expect(mine).not.toContain("their secret");
    expect(await slugs("", null)).not.toContain("my secret");
    expect(await slugs("secret", other.id)).toEqual(["their secret"]);
  });

  it("matches case-insensitively, puts prefix matches first and more used tags before others", async () => {
    expect(await slugs("ACI", me.id)).toEqual(["acid", "acid house"]);
    expect(await slugs("house", me.id)).toEqual(["acid house"]);
  });

  it("returns labels and treats % and _ literally", async () => {
    expect(await suggestTags(db, { query: "acid h", viewer: me, limit: 5 })).toEqual([{ slug: "acid house", label: "Acid house" }]);
    expect(await slugs("%", me.id)).toEqual([]);
    expect(await slugs("_", me.id)).toEqual([]);
  });

  it("limits the number of suggestions", async () => {
    expect(await suggestTags(db, { query: "", viewer: me, limit: 3 })).toHaveLength(3);
  });

  it("leaves out tags of synths the viewer may not see: unapproved or deleted", async () => {
    // Without its approval, the synth's public patches no longer lend their tags to everyone.
    await db.update(synths).set({ approvedAt: null }).where(eq(synths.slug, SYNTH));
    expect(await slugs("acid", null)).toEqual([]);
    expect(await slugs("acid", me.id)).toEqual([]);
    expect(await slugs("bass", null)).toEqual(["bass"]); // curated tags stay

    await db.update(synths).set({ approvedAt: new Date(), deletedAt: new Date() }).where(eq(synths.slug, SYNTH));
    expect(await slugs("acid", null)).toEqual([]);
    expect(await slugs("secret", me.id)).toEqual([]);
  });
});

describe("capitalizeTagLabels", () => {
  it("reports lowercase labels of free tags, fixes them only with apply, and leaves curated tags alone", async () => {
    await db.insert(tags).values([
      { id: "acid", slug: "acid", label: "acid", kind: "free" },
      { id: "tb-303", slug: "tb-303", label: "TB-303", kind: "free" },
      { id: "303", slug: "303", label: "303", kind: "free" },
    ]);
    expect(await capitalizeTagLabels(db, false)).toEqual([{ slug: "acid", from: "acid", to: "Acid" }]);
    expect(await labelOf("acid")).toBe("acid");
    await capitalizeTagLabels(db, true);
    expect(await labelOf("acid")).toBe("Acid");
    expect(await labelOf("fx")).toBe("FX");
    expect(await capitalizeTagLabels(db, true)).toEqual([]);
  });
});
