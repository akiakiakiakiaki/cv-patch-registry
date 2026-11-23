import { createHash, randomUUID } from "node:crypto";
import { validatePanelUpload, type PanelRejection } from "@/lib/assets/panel-upload";
import type { Database } from "@/lib/db/client";
import type { Actor } from "@/lib/domain/policy";
import type { StorageProvider } from "@/lib/storage/storage-provider";
import { countAssetsForOwner, deleteAsset, findUnusedPanels, insertAsset } from "@/lib/repositories/assets-repository";
import { storedBytesForOwner } from "@/lib/repositories/samples-repository";
import { PANEL_MAX_COUNT, STORAGE_QUOTA_BYTES, UNUSED_PANEL_TTL_MS } from "@/lib/assets/asset-quota";

const MIME_BY_KIND = { png: "image/png", jpg: "image/jpeg", svg: "image/svg+xml" } as const;

export interface StoredPanel {
  id: string;
  url: string;
  width: number;
  height: number;
  mime: string;
}

export async function storePanelUpload(
  deps: { db: Database; storage: StorageProvider },
  actor: Actor,
  bytes: Uint8Array,
  now: Date = new Date(),
): Promise<{ ok: true; panel: StoredPanel } | { ok: false; reason: PanelRejection | "quota" }> {
  const validation = validatePanelUpload(bytes);
  if (!validation.ok) return { ok: false, reason: validation.reason };
  const { panel } = validation;

  // Free space taken by abandoned uploads first, so they never block the owner's quota.
  await removeUnusedPanels(deps, actor.id, new Date(now.getTime() - UNUSED_PANEL_TTL_MS));
  const tooMany = (await countAssetsForOwner(deps.db, actor.id, "panel")) >= PANEL_MAX_COUNT;
  const tooLarge = (await storedBytesForOwner(deps.db, actor.id)) + panel.bytes.byteLength > STORAGE_QUOTA_BYTES;
  if (tooMany || tooLarge) return { ok: false, reason: "quota" };

  const storageKey = await deps.storage.put(panel.bytes, panel.kind);
  const id = randomUUID();
  try {
    await insertAsset(deps.db, {
      id,
      ownerId: actor.id,
      kind: "panel",
      mime: MIME_BY_KIND[panel.kind],
      byteSize: panel.bytes.byteLength,
      width: panel.width,
      height: panel.height,
      sha256: createHash("sha256").update(panel.bytes).digest("hex"),
      storageKey,
      status: "active",
    });
  } catch (error) {
    await deps.storage.remove(storageKey);
    throw error;
  }
  return {
    ok: true,
    panel: { id, url: deps.storage.publicUrl(storageKey), width: panel.width, height: panel.height, mime: MIME_BY_KIND[panel.kind] },
  };
}

async function removeUnusedPanels(deps: { db: Database; storage: StorageProvider }, ownerId: string, before: Date): Promise<void> {
  for (const asset of await findUnusedPanels(deps.db, ownerId, before)) {
    try {
      await deleteAsset(deps.db, asset.id);
    } catch {
      continue; // A synth revision started using it in the meantime: keep it.
    }
    // The row is gone, so the file is unreachable either way; a failed delete only leaves an orphaned file.
    await deps.storage.remove(asset.storageKey).catch(() => undefined);
  }
}
