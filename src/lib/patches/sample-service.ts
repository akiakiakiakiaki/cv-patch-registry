import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { SAMPLE_MAX_BYTES, SAMPLE_QUOTA_BYTES, audioEnabled, isMp3 } from "@/lib/audio/sample-rules";
import type { Database } from "@/lib/db/client";
import { canEditPatch, type Actor } from "@/lib/domain/policy";
import { insertAsset } from "@/lib/repositories/assets-repository";
import { findPatchWithSynth } from "@/lib/repositories/patches-repository";
import { findSampleByPatch, insertSample, storedBytesForOwner } from "@/lib/repositories/samples-repository";
import type { StorageProvider } from "@/lib/storage/storage-provider";
import { uploadPublicUrl } from "@/lib/storage/upload-url";

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

/** One sample per patch. The owner confirms the rights; the server checks format, size and quota. */
export async function attachSample(
  deps: { db: Database; storage: StorageProvider },
  actor: Actor,
  patchId: string,
  bytes: Uint8Array,
  meta: SampleMeta,
): Promise<{ ok: true; sample: { url: string; title: string; license: string } } | SampleFailure> {
  if (!audioEnabled()) return { ok: false, error: "disabled" };

  const patch = await findPatchWithSynth(deps.db, patchId);
  if (!patch || !canEditPatch(actor, patch.patch)) return { ok: false, error: "not-found" };
  if (await findSampleByPatch(deps.db, patchId)) return { ok: false, error: "sample-exists" };

  const parsed = metaSchema.safeParse(meta);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (bytes.byteLength > SAMPLE_MAX_BYTES) return { ok: false, error: "too-large" };
  if (!isMp3(bytes)) return { ok: false, error: "unsupported-type" };
  if ((await storedBytesForOwner(deps.db, actor.id)) + bytes.byteLength > SAMPLE_QUOTA_BYTES) {
    return { ok: false, error: "quota" };
  }

  const storageKey = await deps.storage.put(bytes, "mp3");
  const assetId = randomUUID();
  try {
    await insertAsset(deps.db, {
      id: assetId,
      ownerId: actor.id,
      kind: "sample",
      mime: "audio/mpeg",
      byteSize: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      storageKey,
      status: "active",
    });
    await insertSample(deps.db, {
      patchId,
      assetId,
      title: parsed.data.title,
      license: parsed.data.license,
      rightsConfirmedAt: new Date(),
    });
  } catch (error) {
    await deps.storage.remove(storageKey);
    throw error;
  }
  return { ok: true, sample: { url: uploadPublicUrl(storageKey), title: parsed.data.title, license: parsed.data.license } };
}
