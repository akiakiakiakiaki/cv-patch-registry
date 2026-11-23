import { randomUUID } from "node:crypto";
import { parseSynthLayout } from "@/lib/adapters/synth-layout-adapter";
import {
  decodePatchDocument,
  encodePatchDocument,
  localImportSchema,
  normalizeSubmittedData,
  patchCreateSchema,
  patchUpdateSchema,
} from "@/lib/adapters/patch-document-adapter";
import type { Database } from "@/lib/db/client";
import { canEditPatch, canViewPatch, type Actor, type Visibility } from "@/lib/domain/policy";
import { normalizeTags } from "@/lib/domain/tags";
import type { PatchData } from "@/lib/domain/types";
import type { InstrumentLayout } from "@/lib/instrument/layout";
import { findAssetById } from "@/lib/repositories/assets-repository";
import { audioEnabled } from "@/lib/audio/sample-rules";
import { findSampleByPatch } from "@/lib/repositories/samples-repository";
import { ensureTagIds } from "@/lib/repositories/tags-repository";
import {
  deletePatchOwned,
  findPatchWithSynth,
  insertPatch,
  insertPatchIfAbsent,
  listPatchesWithSynth,
  replacePatchTags,
  tagSlugsFor,
  updatePatchIfRevision,
  type PatchWithSynth,
} from "@/lib/repositories/patches-repository";
import { findActiveSynthBySlug, findRevision } from "@/lib/repositories/synths-repository";
import { findRevisionLosses, type RevisionLoss } from "@/lib/patches/revision-loss";

/** Saving would move the patch to a newer synth revision that lacks some of its controls. Needs confirmation. */
export interface RevisionLossFailure {
  ok: false;
  error: "revision-loss";
  fromRevision: number;
  toRevision: number;
  losses: RevisionLoss[];
}
import { storagePublicUrl } from "@/lib/storage";

export type PatchFailure =
  | { ok: false; error: "invalid"; issues: string[] }
  | RevisionLossFailure
  | { ok: false; error: "not-found" | "conflict" | "synth-not-found" | "too-many-tags" | "invalid-tags" };

export interface PatchSummary {
  id: string;
  name: string;
  visibility: Visibility;
  revision: number;
  updatedAt: string;
  synth: { slug: string; displayName: string };
  tags: string[];
}

export interface PatchView {
  id: string;
  name: string;
  description: string | null;
  visibility: Visibility;
  revision: number;
  ownerId: string;
  isOwner: boolean;
  tags: string[];
  updatedAt: string;
  synth: { slug: string; displayName: string; panelUrl: string; layout: InstrumentLayout };
  data: PatchData;
  sample: { url: string; title: string; license: string } | null;
}

function issuesOf(error: { issues: { path: PropertyKey[] }[] }): string[] {
  return error.issues.map((issue) => issue.path.map(String).join(".") || "input");
}

function tagFailure(reason: "invalid" | "too-many"): PatchFailure {
  return { ok: false, error: reason === "too-many" ? "too-many-tags" : "invalid-tags" };
}

async function panelUrlFor(db: Database, patch: PatchWithSynth): Promise<string> {
  if (patch.panelSource === "bundled") return patch.panelBundledSrc ?? "";
  if (!patch.panelAssetId) return "";
  const asset = await findAssetById(db, patch.panelAssetId);
  return asset ? storagePublicUrl(asset.storageKey) : "";
}

function summaryOf(row: PatchWithSynth, tags: string[]): PatchSummary {
  return {
    id: row.patch.id,
    name: row.patch.name,
    visibility: row.patch.visibility,
    revision: row.patch.revision,
    updatedAt: row.patch.updatedAt.toISOString(),
    synth: { slug: row.synthSlug, displayName: row.synthDisplayName },
    tags,
  };
}

async function summaries(db: Database, rows: PatchWithSynth[]): Promise<PatchSummary[]> {
  const tagMap = await tagSlugsFor(db, rows.map((row) => row.patch.id));
  return rows.map((row) => summaryOf(row, tagMap.get(row.patch.id) ?? []));
}

export async function createPatch(
  db: Database,
  actor: Actor,
  input: unknown,
): Promise<{ ok: true; id: string; revision: number } | PatchFailure> {
  const parsed = patchCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", issues: issuesOf(parsed.error) };
  const body = parsed.data;

  const synth = await findActiveSynthBySlug(db, body.synthSlug);
  if (!synth || !synth.currentRevisionId) return { ok: false, error: "synth-not-found" };
  const revision = await findRevision(db, synth.currentRevisionId);
  const layout = revision ? parseSynthLayout(revision.layout) : null;
  if (!revision || !layout) return { ok: false, error: "synth-not-found" };

  const tags = normalizeTags(body.tags ?? []);
  if (!tags.ok) return tagFailure(tags.reason);

  const id = body.id ?? randomUUID();
  if (body.id && (await findPatchWithSynth(db, body.id))) return { ok: false, error: "conflict" };
  await insertPatch(db, {
    id,
    ownerId: actor.id,
    synthRevisionId: revision.id,
    name: body.name,
    description: body.description || null,
    visibility: body.visibility ?? "private",
    revision: 1,
    data: encodePatchDocument(normalizeSubmittedData(body.data ?? {}, layout), layout),
  });
  await replacePatchTags(db, id, await ensureTagIds(db, tags.tags));
  return { ok: true, id, revision: 1 };
}

export async function updatePatch(
  db: Database,
  actor: Actor,
  patchId: string,
  input: unknown,
): Promise<{ ok: true; revision: number } | PatchFailure> {
  const existing = await findPatchWithSynth(db, patchId);
  if (!existing || !canEditPatch(actor, existing.patch)) return { ok: false, error: "not-found" };

  const parsed = patchUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", issues: issuesOf(parsed.error) };
  const body = parsed.data;
  if (body.expectedRevision !== existing.patch.revision) return { ok: false, error: "conflict" };

  const storedLayout = parseSynthLayout(existing.layout);
  if (!storedLayout) return { ok: false, error: "invalid", issues: ["synth"] };
  // The editor always shows the synth's current panel, so a save moves the patch to that revision.
  // Validating against the patch's older revision would silently drop controls and ports added since.
  const target = body.keepRevision
    ? { id: existing.patch.synthRevisionId, number: existing.revisionNumber, layout: storedLayout }
    : await currentRevisionFor(db, existing);
  if (!target) return { ok: false, error: "invalid", issues: ["synth"] };
  const layout = target.layout;
  const currentTags = (await tagSlugsFor(db, [patchId])).get(patchId) ?? [];
  const tags = normalizeTags(body.tags ?? currentTags);
  if (!tags.ok) return tagFailure(tags.reason);

  const submitted = body.data === undefined ? (decodePatchDocument(existing.patch.data, storedLayout) ?? {}) : body.data;
  if (target.id !== existing.patch.synthRevisionId && !body.acceptRevisionLoss) {
    const losses = findRevisionLosses(submitted, storedLayout, layout);
    if (losses.length > 0) {
      return { ok: false, error: "revision-loss", fromRevision: existing.revisionNumber, toRevision: target.number, losses };
    }
  }
  const data = normalizeSubmittedData(submitted, layout);

  const advanced = await updatePatchIfRevision(db, {
    patchId,
    ownerId: actor.id,
    expectedRevision: body.expectedRevision,
    set: {
      name: body.name,
      description: body.description || null,
      visibility: body.visibility ?? existing.patch.visibility,
      synthRevisionId: target.id,
      data: encodePatchDocument(data, layout),
    },
  });
  if (!advanced) return { ok: false, error: "conflict" };
  await replacePatchTags(db, patchId, await ensureTagIds(db, tags.tags));
  return { ok: true, revision: body.expectedRevision + 1 };
}

/** The synth's current revision with its parsed layout; falls back to the patch's own revision. */
async function currentRevisionFor(
  db: Database,
  existing: PatchWithSynth,
): Promise<{ id: string; number: number; layout: InstrumentLayout } | null> {
  const currentId = existing.synthCurrentRevisionId;
  if (currentId && currentId !== existing.patch.synthRevisionId) {
    const revision = await findRevision(db, currentId);
    const layout = revision ? parseSynthLayout(revision.layout) : null;
    if (revision && layout) return { id: revision.id, number: revision.number, layout };
  }
  const layout = parseSynthLayout(existing.layout);
  return layout ? { id: existing.patch.synthRevisionId, number: existing.revisionNumber, layout } : null;
}

export async function deletePatch(db: Database, actor: Actor, patchId: string): Promise<{ ok: true } | PatchFailure> {
  const deleted = await deletePatchOwned(db, patchId, actor.id);
  return deleted ? { ok: true } : { ok: false, error: "not-found" };
}

/** Private patches answer null for everyone but their owner, so their existence is not revealed. */
export async function getPatchView(db: Database, actor: Actor | null, patchId: string): Promise<PatchView | null> {
  const row = await findPatchWithSynth(db, patchId);
  if (!row || !canViewPatch(actor, row.patch)) return null;
  const layout = parseSynthLayout(row.layout);
  const data = layout ? decodePatchDocument(row.patch.data, layout) : null;
  if (!layout || !data) return null;
  const tags = (await tagSlugsFor(db, [patchId])).get(patchId) ?? [];
  return {
    sample: await sampleViewFor(db, patchId),
    id: row.patch.id,
    name: row.patch.name,
    description: row.patch.description,
    visibility: row.patch.visibility,
    revision: row.patch.revision,
    ownerId: row.patch.ownerId,
    isOwner: actor?.id === row.patch.ownerId,
    tags,
    updatedAt: row.patch.updatedAt.toISOString(),
    synth: {
      slug: row.synthSlug,
      displayName: row.synthDisplayName,
      panelUrl: await panelUrlFor(db, row),
      layout,
    },
    data,
  };
}

async function sampleViewFor(db: Database, patchId: string): Promise<PatchView["sample"]> {
  if (!audioEnabled()) return null;
  const sample = await findSampleByPatch(db, patchId);
  if (!sample) return null;
  const asset = await findAssetById(db, sample.assetId);
  return asset ? { url: storagePublicUrl(asset.storageKey), title: sample.title, license: sample.license } : null;
}

/** Full state of one of the actor's patches. Used to load the account library of a synth. */
export interface PatchState {
  id: string;
  name: string;
  updatedAt: string;
  revision: number;
  visibility: Visibility;
  tags: string[];
  data: PatchData;
  /** Number of the synth revision the patch is stored with. */
  synthRevision: number;
  /** Settings the synth's current revision has no control for. Empty when the patch is current or compatible. */
  revisionLosses: RevisionLoss[];
}

export async function listOwnPatchStates(db: Database, actor: Actor, synthSlug: string): Promise<PatchState[]> {
  const rows = await listPatchesWithSynth(db, { ownerId: actor.id, synthSlug });
  const tagMap = await tagSlugsFor(db, rows.map((row) => row.patch.id));
  // All rows belong to one synth, so its current revision is resolved once.
  const current = rows[0] ? await currentRevisionFor(db, rows[0]) : null;
  const states: PatchState[] = [];
  for (const row of rows) {
    const layout = parseSynthLayout(row.layout);
    const data = layout ? decodePatchDocument(row.patch.data, layout) : null;
    if (!layout || !data) continue;
    const outdated = current !== null && current.id !== row.patch.synthRevisionId;
    states.push({
      synthRevision: row.revisionNumber,
      revisionLosses: outdated ? findRevisionLosses(data, layout, current.layout) : [],
      id: row.patch.id,
      name: row.patch.name,
      updatedAt: row.patch.updatedAt.toISOString(),
      revision: row.patch.revision,
      visibility: row.patch.visibility,
      tags: tagMap.get(row.patch.id) ?? [],
      data,
    });
  }
  return states;
}

export async function listOwnPatches(db: Database, actor: Actor): Promise<PatchSummary[]> {
  return summaries(db, await listPatchesWithSynth(db, { ownerId: actor.id }));
}

export async function listPublicPatches(
  db: Database,
  filter: { synthSlug?: string; tagSlug?: string },
): Promise<PatchSummary[]> {
  return summaries(db, await listPatchesWithSynth(db, { ...filter, visibility: "public" }));
}

/** Copies a browser-side library into the account. Imported patches start private. */
export async function importLocalPatches(
  db: Database,
  actor: Actor,
  input: unknown,
): Promise<{ ok: true; created: number } | PatchFailure> {
  const parsed = localImportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", issues: issuesOf(parsed.error) };
  const synth = await findActiveSynthBySlug(db, parsed.data.synthSlug);
  if (!synth || !synth.currentRevisionId) return { ok: false, error: "synth-not-found" };
  const revision = await findRevision(db, synth.currentRevisionId);
  const layout = revision ? parseSynthLayout(revision.layout) : null;
  if (!revision || !layout) return { ok: false, error: "synth-not-found" };

  let created = 0;
  for (const patch of parsed.data.patches) {
    const id = patch.id ?? randomUUID();
    const inserted = await insertPatchIfAbsent(db, {
      id,
      ownerId: actor.id,
      synthRevisionId: revision.id,
      name: patch.name,
      visibility: "private",
      revision: 1,
      data: encodePatchDocument(normalizeSubmittedData(patch.data ?? {}, layout), layout),
    });
    if (!inserted) {
      // Keep retries of the same browser import idempotent. Never overwrite another patch.
      const existing = await findPatchWithSynth(db, id);
      if (existing?.patch.ownerId === actor.id && existing.synthSlug === synth.slug) continue;
      return { ok: false, error: "conflict" };
    }
    created += 1;
  }
  return { ok: true, created };
}
