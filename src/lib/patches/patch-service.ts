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
  listPatchesWithSynth,
  replacePatchTags,
  tagSlugsFor,
  updatePatchIfRevision,
  type PatchWithSynth,
} from "@/lib/repositories/patches-repository";
import { findActiveSynthBySlug, findRevision } from "@/lib/repositories/synths-repository";
import { uploadPublicUrl } from "@/lib/storage/upload-files";

export type PatchFailure =
  | { ok: false; error: "invalid"; issues: string[] }
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
  return asset ? uploadPublicUrl(asset.storageKey) : "";
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

  const layout = parseSynthLayout(existing.layout);
  if (!layout) return { ok: false, error: "invalid", issues: ["synth"] };
  const currentTags = (await tagSlugsFor(db, [patchId])).get(patchId) ?? [];
  const tags = normalizeTags(body.tags ?? currentTags);
  if (!tags.ok) return tagFailure(tags.reason);

  const data =
    body.data === undefined
      ? (decodePatchDocument(existing.patch.data, layout) ?? normalizeSubmittedData({}, layout))
      : normalizeSubmittedData(body.data, layout);

  const advanced = await updatePatchIfRevision(db, {
    patchId,
    ownerId: actor.id,
    expectedRevision: body.expectedRevision,
    set: {
      name: body.name,
      description: body.description || null,
      visibility: body.visibility ?? existing.patch.visibility,
      data: encodePatchDocument(data, layout),
    },
  });
  if (!advanced) return { ok: false, error: "conflict" };
  await replacePatchTags(db, patchId, await ensureTagIds(db, tags.tags));
  return { ok: true, revision: body.expectedRevision + 1 };
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
  return asset ? { url: uploadPublicUrl(asset.storageKey), title: sample.title, license: sample.license } : null;
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
}

export async function listOwnPatchStates(db: Database, actor: Actor, synthSlug: string): Promise<PatchState[]> {
  const rows = await listPatchesWithSynth(db, { ownerId: actor.id, synthSlug });
  const tagMap = await tagSlugsFor(db, rows.map((row) => row.patch.id));
  const states: PatchState[] = [];
  for (const row of rows) {
    const layout = parseSynthLayout(row.layout);
    const data = layout ? decodePatchDocument(row.patch.data, layout) : null;
    if (!data) continue;
    states.push({
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

  for (const patch of parsed.data.patches) {
    await insertPatch(db, {
      id: randomUUID(),
      ownerId: actor.id,
      synthRevisionId: revision.id,
      name: patch.name,
      visibility: "private",
      revision: 1,
      data: encodePatchDocument(normalizeSubmittedData(patch.data ?? {}, layout), layout),
    });
  }
  return { ok: true, created: parsed.data.patches.length };
}
