import { createHash, randomUUID } from "node:crypto";
import { normalizePatchDataForLayout } from "@/lib/adapters/patch-adapter";
import {
  LEGACY_PROTON_SLUG,
  PROTON_CLONE_MANUFACTURER,
  PROTON_CLONE_NAME,
  PROTON_CLONE_PANEL,
  PROTON_CLONE_SLUG,
  buildProtonCloneLayout,
  migrateLegacyPatchData,
} from "@/lib/adapters/proton-legacy-migration-adapter";
import { draftControlsFromLayout, draftToLayout, parseSynthLayout } from "@/lib/adapters/synth-layout-adapter";
import { storePanelUpload } from "@/lib/assets/asset-service";
import { validatePanelUpload } from "@/lib/assets/panel-upload";
import type { Database } from "@/lib/db/client";
import { canonicalJson } from "@/lib/domain/canonical-json";
import type { PatchData } from "@/lib/domain/types";
import { createPatch } from "@/lib/patches/patch-service";
import { deleteAsset, findAssetById, insertAsset } from "@/lib/repositories/assets-repository";
import { findPatchWithSynth, listPatchesWithSynth, tagSlugsFor } from "@/lib/repositories/patches-repository";
import { findSampleByPatch, insertSample } from "@/lib/repositories/samples-repository";
import { findSynthBySlug, setSynthApproval } from "@/lib/repositories/synths-repository";
import type { StorageProvider, UploadExtension } from "@/lib/storage/storage-provider";
import { createSynth } from "@/lib/synths/synth-service";

/**
 * Copies the built-in (legacy) Behringer Proton into an ordinary, editable synth owned by one user,
 * together with every user's patches of it. Without `apply` nothing is written; the report shows the plan.
 * Running it again is safe: the clone is reused and patches already copied are skipped.
 */

export interface ProtonClonePatch {
  legacyId: string;
  cloneId: string;
  name: string;
  ownerId: string;
  action: "copy" | "exists";
  sample: boolean;
  values: { knobs: number; switches: number; leds: number; cables: number };
}

export interface ProtonCloneReport {
  synth: "create" | "exists";
  patches: ProtonClonePatch[];
}

export type ProtonCloneFailure =
  | { ok: false; error: "legacy-missing" }
  | { ok: false; error: "slug-taken"; ownerId: string | null }
  | { ok: false; error: "panel-invalid"; detail: string }
  | { ok: false; error: "layout-mismatch" }
  | { ok: false; error: "create-failed"; detail: string };

/** The copy of a legacy patch gets an ID derived from the original, so a second run finds it. */
export function clonePatchId(legacyPatchId: string): string {
  const hex = createHash("sha256").update(`${PROTON_CLONE_SLUG}:${legacyPatchId}`).digest("hex");
  const variant = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function countValues(data: PatchData): ProtonClonePatch["values"] {
  return {
    knobs: Object.keys(data.knobs).length,
    switches: Object.keys(data.switches).length,
    leds: Object.keys(data.leds).length,
    cables: data.cables.length,
  };
}

export async function cloneLegacyProton(
  deps: { db: Database; storage: StorageProvider },
  input: { ownerId: string; panelBytes: Uint8Array; apply: boolean },
): Promise<{ ok: true; report: ProtonCloneReport } | ProtonCloneFailure> {
  const { db, storage } = deps;
  const legacy = await findSynthBySlug(db, LEGACY_PROTON_SLUG);
  if (!legacy || legacy.deletedAt) return { ok: false, error: "legacy-missing" };

  // Everything is checked before anything is written.
  const existing = await findSynthBySlug(db, PROTON_CLONE_SLUG);
  if (existing && (existing.deletedAt || existing.ownerId !== input.ownerId)) {
    return { ok: false, error: "slug-taken", ownerId: existing.ownerId };
  }
  const expected = buildProtonCloneLayout();
  const draft = {
    displayName: PROTON_CLONE_NAME,
    slug: PROTON_CLONE_SLUG,
    manufacturer: PROTON_CLONE_MANUFACTURER,
    categories: [...(expected.categories ?? [])],
    controls: draftControlsFromLayout(expected),
  };
  if (!existing) {
    const panel = validatePanelUpload(input.panelBytes);
    if (!panel.ok) return { ok: false, error: "panel-invalid", detail: panel.reason };
    if (panel.panel.width !== PROTON_CLONE_PANEL.width || panel.panel.height !== PROTON_CLONE_PANEL.height) {
      return { ok: false, error: "panel-invalid", detail: `expected ${PROTON_CLONE_PANEL.width}x${PROTON_CLONE_PANEL.height}, got ${panel.panel.width}x${panel.panel.height}` };
    }
    const built = draftToLayout(draft, PROTON_CLONE_PANEL, 1);
    if (!built.ok || canonicalJson(built.layout) !== canonicalJson(expected)) return { ok: false, error: "layout-mismatch" };
  }

  // The legacy synth may already be hidden (FEATURE_LEGACY_SYNTHS=false); its patches must still be copied.
  const rows = await listPatchesWithSynth(db, { synthSlug: LEGACY_PROTON_SLUG, includeHidden: true, viewer: null });
  const plans: Array<ProtonClonePatch & { data: PatchData }> = [];
  for (const row of rows) {
    const layout = parseSynthLayout(row.layout);
    if (!layout) continue;
    // Read without restricting switches to the layout's IDs: the legacy channel keys (`Loop::blue`,
    // `Shift::blue`) are not switch IDs but must reach the migration.
    const legacyData = normalizePatchDataForLayout(row.patch.data, layout);
    const data = migrateLegacyPatchData(legacyData);
    const cloneId = clonePatchId(row.patch.id);
    plans.push({
      legacyId: row.patch.id,
      cloneId,
      name: row.patch.name,
      ownerId: row.patch.ownerId,
      action: (await findPatchWithSynth(db, cloneId, { id: row.patch.ownerId })) ? "exists" : "copy",
      sample: (await findSampleByPatch(db, row.patch.id)) !== null,
      values: countValues(data),
      data,
    });
  }
  const report: ProtonCloneReport = { synth: existing ? "exists" : "create", patches: plans.map(({ data: _data, ...plan }) => plan) };
  if (!input.apply) return { ok: true, report };

  if (!existing) {
    const stored = await storePanelUpload({ db, storage }, { id: input.ownerId }, input.panelBytes);
    if (!stored.ok) return { ok: false, error: "panel-invalid", detail: stored.reason };
    const created = await createSynth(db, { id: input.ownerId }, { ...draft, panelAssetId: stored.panel.id });
    if (!created.ok) return { ok: false, error: "create-failed", detail: created.error };
    // The clone replaces the visible built-in Proton: approved right away, so every owner's patches can move to it.
    const clone = await findSynthBySlug(db, PROTON_CLONE_SLUG);
    if (!clone || !(await setSynthApproval(db, clone.id, true))) return { ok: false, error: "create-failed", detail: "approval" };
  }

  const tags = await tagSlugsFor(db, plans.map((plan) => plan.legacyId));
  for (const plan of plans.filter((item) => item.action === "copy")) {
    const legacyRow = rows.find((row) => row.patch.id === plan.legacyId)!;
    const created = await createPatch(db, { id: plan.ownerId }, {
      id: plan.cloneId,
      synthSlug: PROTON_CLONE_SLUG,
      name: plan.name,
      description: legacyRow.patch.description ?? undefined,
      visibility: legacyRow.patch.visibility,
      tags: tags.get(plan.legacyId) ?? [],
      data: plan.data,
    });
    if (!created.ok) return { ok: false, error: "create-failed", detail: `patch ${plan.legacyId}: ${created.error}` };
  }
  // Also completes copies from an earlier run that stopped before their sample was copied.
  for (const plan of plans.filter((item) => item.sample)) {
    if (!(await findSampleByPatch(db, plan.cloneId))) await copySample({ db, storage }, plan.legacyId, plan.cloneId, plan.ownerId);
  }
  return { ok: true, report };
}

/** The copy gets its own file, so replacing or deleting either sample never affects the other. */
async function copySample(deps: { db: Database; storage: StorageProvider }, fromPatchId: string, toPatchId: string, ownerId: string) {
  const sample = await findSampleByPatch(deps.db, fromPatchId);
  const asset = sample ? await findAssetById(deps.db, sample.assetId) : null;
  if (!sample || !asset) return;
  const bytes = await deps.storage.read(asset.storageKey);
  const extension = asset.storageKey.slice(asset.storageKey.lastIndexOf(".") + 1) as UploadExtension;
  const storageKey = await deps.storage.put(bytes, extension);
  const id = randomUUID();
  try {
    await insertAsset(deps.db, { ...asset, id, ownerId, storageKey, createdAt: new Date() });
    await insertSample(deps.db, { patchId: toPatchId, assetId: id, title: sample.title, license: sample.license, rightsConfirmedAt: sample.rightsConfirmedAt });
  } catch (error) {
    await deleteAsset(deps.db, id).catch(() => undefined);
    await deps.storage.remove(storageKey);
    throw error;
  }
}
