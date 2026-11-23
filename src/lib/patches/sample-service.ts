import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { SAMPLE_MAX_BYTES, SAMPLE_QUOTA_BYTES, audioEnabled, sampleFormat } from "@/lib/audio/sample-rules";
import type { Database } from "@/lib/db/client";
import { canEditPatch, type Actor } from "@/lib/domain/policy";
import { deleteAsset, findAssetById, insertAsset } from "@/lib/repositories/assets-repository";
import { findPatchWithSynth } from "@/lib/repositories/patches-repository";
import { findSampleByPatch, insertSample, replaceSample, storedBytesForOwner } from "@/lib/repositories/samples-repository";
import type { StorageProvider } from "@/lib/storage/storage-provider";

export type SampleFailure = {
  ok: false;
  error: "disabled" | "not-found" | "sample-exists" | "invalid" | "unsupported-type" | "too-large" | "quota";
};

const metaSchema = z.object({
  title: z.string().trim().min(1).max(80),
  license: z.string().trim().min(1).max(40),
  rightsConfirmed: z.literal(true),
});

export interface SampleMeta {
  title: string;
  license: string;
  rightsConfirmed: boolean;
}

/**
 * One sample per patch. The owner confirms the rights; the server checks format, size and quota.
 * With `replace`, an existing sample is swapped for the new file and the old file is removed.
 */
export async function attachSample(
  deps: { db: Database; storage: StorageProvider },
  actor: Actor,
  patchId: string,
  bytes: Uint8Array,
  meta: SampleMeta,
  options: { replace?: boolean } = {},
): Promise<{ ok: true; sample: { url: string; title: string; license: string } } | SampleFailure> {
  if (!audioEnabled()) return { ok: false, error: "disabled" };

  const patch = await findPatchWithSynth(deps.db, patchId);
  if (!patch || !canEditPatch(actor, patch.patch)) return { ok: false, error: "not-found" };
  const existing = await findSampleByPatch(deps.db, patchId);
  if (existing && !options.replace) return { ok: false, error: "sample-exists" };

  const parsed = metaSchema.safeParse(meta);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (bytes.byteLength > SAMPLE_MAX_BYTES) return { ok: false, error: "too-large" };
  const format = sampleFormat(bytes);
  if (!format) return { ok: false, error: "unsupported-type" };
  // The replaced file is freed by this upload, so it does not count against the quota.
  const previousAsset = existing ? await findAssetById(deps.db, existing.assetId) : null;
  const freed = previousAsset?.byteSize ?? 0;
  if ((await storedBytesForOwner(deps.db, actor.id)) - freed + bytes.byteLength > SAMPLE_QUOTA_BYTES) {
    return { ok: false, error: "quota" };
  }

  const storageKey = await deps.storage.put(bytes, format.extension);
  const assetId = randomUUID();
  const row = { patchId, assetId, title: parsed.data.title, license: parsed.data.license, rightsConfirmedAt: new Date() };
  try {
    await insertAsset(deps.db, {
      id: assetId,
      ownerId: actor.id,
      kind: "sample",
      mime: format.mime,
      byteSize: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      storageKey,
      status: "active",
    });
    if (existing) await replaceSample(deps.db, row);
    else await insertSample(deps.db, row);
  } catch (error) {
    await deleteAsset(deps.db, assetId).catch(() => undefined);
    await deps.storage.remove(storageKey);
    throw error;
  }
  if (previousAsset) {
    // The sample row points at the new asset now, so the old one is unreferenced.
    await deleteAsset(deps.db, previousAsset.id);
    await deps.storage.remove(previousAsset.storageKey).catch(() => undefined);
  }
  return { ok: true, sample: { url: deps.storage.publicUrl(storageKey), title: parsed.data.title, license: parsed.data.license } };
}
