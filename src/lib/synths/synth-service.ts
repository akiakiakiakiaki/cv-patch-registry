import { randomUUID } from "node:crypto";
import { draftToLayout, parseSynthDraft, parseSynthLayout } from "@/lib/adapters/synth-layout-adapter";
import type { Database } from "@/lib/db/client";
import { canEditSynth, type Actor } from "@/lib/domain/policy";
import { uploadPublicUrl } from "@/lib/storage/upload-files";
import type { InstrumentLayout } from "@/lib/instrument/layout";
import { findActiveOwnedAsset, findAssetById } from "@/lib/repositories/assets-repository";
import {
  appendSynthRevision,
  createSynthWithInitialRevision,
  findRevision,
  findSynthBySlug,
  findActiveSynthBySlug,
  listSynthRows,
  type RevisionRow,
  type SynthRow,
} from "@/lib/repositories/synths-repository";

export type SynthFailure =
  | { ok: false; error: "invalid"; issues: string[] }
  | { ok: false; error: "not-found" | "conflict" | "slug-taken" | "panel" };

export type SynthSuccess = { ok: true; slug: string; revision: number };

export interface SynthView {
  slug: string;
  displayName: string;
  manufacturer: string | null;
  revision: number;
  isBuiltIn: boolean;
  ownerId: string | null;
  layout: InstrumentLayout;
  panelUrl: string;
}

export async function createSynth(db: Database, actor: Actor, input: unknown): Promise<SynthSuccess | SynthFailure> {
  const parsed = parseSynthDraft(input);
  if (!parsed.ok) return { ok: false, error: "invalid", issues: parsed.issues };
  const draft = parsed.draft;
  if (draft.expectedRevision !== undefined) return { ok: false, error: "invalid", issues: ["expectedRevision"] };
  if (!draft.panelAssetId) return { ok: false, error: "panel" };

  const asset = await findActiveOwnedAsset(db, actor.id, draft.panelAssetId);
  if (!asset || asset.width === null || asset.height === null) return { ok: false, error: "panel" };
  if (await findSynthBySlug(db, draft.slug)) return { ok: false, error: "slug-taken" };

  const built = draftToLayout(draft, { width: asset.width, height: asset.height }, 1);
  if (!built.ok) return { ok: false, error: "invalid", issues: built.issues };

  const synthId = randomUUID();
  const revisionId = randomUUID();
  const created = await createSynthWithInitialRevision(db, {
    synth: {
      id: synthId,
      ownerId: actor.id,
      slug: draft.slug,
      displayName: draft.displayName,
      manufacturer: draft.manufacturer || null,
    },
    revision: {
      id: revisionId,
      synthId,
      number: 1,
      panelSource: "asset",
      panelAssetId: asset.id,
      layout: built.layout,
      schemaVersion: built.layout.schemaVersion,
      schemaMinor: built.layout.schemaMinor ?? 0,
    },
  });
  if (!created) return { ok: false, error: "slug-taken" };
  return { ok: true, slug: draft.slug, revision: 1 };
}

export async function createSynthRevision(
  db: Database,
  actor: Actor,
  slug: string,
  input: unknown,
): Promise<SynthSuccess | SynthFailure> {
  const synth = await findActiveSynthBySlug(db, slug);
  if (!synth || !canEditSynth(actor, synth)) return { ok: false, error: "not-found" };

  const parsed = parseSynthDraft(input);
  if (!parsed.ok) return { ok: false, error: "invalid", issues: parsed.issues };
  const draft = parsed.draft;
  if (draft.expectedRevision === undefined) return { ok: false, error: "invalid", issues: ["expectedRevision"] };

  const current = synth.currentRevisionId ? await findRevision(db, synth.currentRevisionId) : null;
  if (!current) return { ok: false, error: "not-found" };
  if (draft.expectedRevision !== current.number) return { ok: false, error: "conflict" };

  const panel = await resolvePanel(db, actor, draft.panelAssetId, current);
  if (!panel) return { ok: false, error: "panel" };

  const nextNumber = current.number + 1;
  const built = draftToLayout(draft, panel, nextNumber);
  if (!built.ok) return { ok: false, error: "invalid", issues: built.issues };

  const revisionId = randomUUID();
  const advanced = await appendSynthRevision(db, {
    synthId: synth.id,
    ownerId: actor.id,
    expectedRevisionId: current.id,
    synth: {
      displayName: draft.displayName,
      manufacturer: draft.manufacturer || null,
    },
    revision: {
      id: revisionId,
      synthId: synth.id,
      number: nextNumber,
      panelSource: "asset",
      panelAssetId: panel.assetId,
      layout: built.layout,
      schemaVersion: built.layout.schemaVersion,
      schemaMinor: built.layout.schemaMinor ?? 0,
    },
  });
  if (!advanced) return { ok: false, error: "conflict" };
  return { ok: true, slug, revision: nextNumber };
}

/** New panel from the request, or the panel the current revision already uses. */
async function resolvePanel(
  db: Database,
  actor: Actor,
  panelAssetId: string | undefined,
  current: RevisionRow,
): Promise<{ assetId: string; width: number; height: number } | null> {
  if (panelAssetId) {
    const asset = await findActiveOwnedAsset(db, actor.id, panelAssetId);
    if (!asset || asset.width === null || asset.height === null) return null;
    return { assetId: asset.id, width: asset.width, height: asset.height };
  }
  if (current.panelSource !== "asset" || !current.panelAssetId) return null;
  const asset = await findAssetById(db, current.panelAssetId);
  if (!asset || asset.width === null || asset.height === null) return null;
  return { assetId: asset.id, width: asset.width, height: asset.height };
}

async function viewOf(db: Database, synth: SynthRow): Promise<SynthView | null> {
  const revision = synth.currentRevisionId ? await findRevision(db, synth.currentRevisionId) : null;
  if (!revision) return null;
  const layout = parseSynthLayout(revision.layout);
  if (!layout) return null;
  let panelUrl = revision.panelBundledSrc ?? "";
  if (revision.panelSource === "asset" && revision.panelAssetId) {
    const asset = await findAssetById(db, revision.panelAssetId);
    if (!asset) return null;
    panelUrl = uploadPublicUrl(asset.storageKey);
  }
  return {
    slug: synth.slug,
    displayName: synth.displayName,
    manufacturer: synth.manufacturer,
    revision: revision.number,
    isBuiltIn: synth.ownerId === null,
    ownerId: synth.ownerId,
    layout,
    panelUrl,
  };
}

export async function getSynthView(db: Database, slug: string): Promise<SynthView | null> {
  const synth = await findActiveSynthBySlug(db, slug);
  return synth ? viewOf(db, synth) : null;
}

export async function listSynthViews(db: Database): Promise<SynthView[]> {
  const rows = await listSynthRows(db);
  const views = await Promise.all(rows.map((row) => viewOf(db, row)));
  return views.filter((view): view is SynthView => view !== null);
}
