import { createHash, randomUUID } from "node:crypto";
import { validatePanelUpload, type PanelRejection } from "@/lib/assets/panel-upload";
import type { Database } from "@/lib/db/client";
import type { Actor } from "@/lib/domain/policy";
import type { StorageProvider } from "@/lib/storage/storage-provider";
import { uploadPublicUrl } from "@/lib/storage/upload-files";
import { insertAsset } from "@/lib/repositories/assets-repository";

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
): Promise<{ ok: true; panel: StoredPanel } | { ok: false; reason: PanelRejection }> {
  const validation = validatePanelUpload(bytes);
  if (!validation.ok) return { ok: false, reason: validation.reason };
  const { panel } = validation;

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
    panel: { id, url: uploadPublicUrl(storageKey), width: panel.width, height: panel.height, mime: MIME_BY_KIND[panel.kind] },
  };
}
