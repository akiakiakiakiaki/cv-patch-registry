import { api } from "@/lib/api/client";
import type { MessageKey, MessageValues } from "@/i18n/messages";

export type PanelUploadResult =
  | { ok: true; panel: { url: string; width: number; height: number; assetId: string } }
  | { ok: false; reason: string };

/** Uploads a panel image through the asset API. The server decides the type from the bytes. */
export async function uploadPanelFile(file: File): Promise<PanelUploadResult> {
  const response = await api.assets.uploadPanel(file);
  if (!response.ok) return { ok: false, reason: response.error ?? String(response.status) };
  const panel = response.data.panel;
  if (!panel) return { ok: false, reason: String(response.status) };
  return { ok: true, panel: { url: panel.url, width: panel.width, height: panel.height, assetId: panel.id } };
}

/** User-facing text for a rejected panel upload; a full quota gets its own sentence. */
export function panelRejectionMessage(reason: string, t: (key: MessageKey, values?: MessageValues) => string): string {
  return reason === "quota" ? t("synths.panelQuota") : t("synths.panelRejected", { reason });
}
