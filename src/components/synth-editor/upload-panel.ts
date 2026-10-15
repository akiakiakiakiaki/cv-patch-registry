export type PanelUploadResult =
  | { ok: true; panel: { url: string; width: number; height: number; assetId: string } }
  | { ok: false; reason: string };

/** Uploads a panel image through the asset API. The server decides the type from the bytes. */
export async function uploadPanelFile(file: File): Promise<PanelUploadResult> {
  const response = await fetch("/api/assets?kind=panel", { method: "POST", body: file });
  const body = (await response.json().catch(() => ({}))) as {
    panel?: { id: string; url: string; width: number; height: number };
    error?: string;
  };
  if (!response.ok || !body.panel) return { ok: false, reason: body.error ?? String(response.status) };
  return { ok: true, panel: { url: body.panel.url, width: body.panel.width, height: body.panel.height, assetId: body.panel.id } };
}
