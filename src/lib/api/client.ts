import type { BackupManifest, BackupTables } from "@/lib/backup/backup-format";
import type { PatchData, PatchRecord } from "@/lib/domain/types";
import type { UploadTarget } from "@/lib/storage/storage-provider";
import type { TagEntry } from "@/lib/domain/tags";
import type { PatchState, PatchView } from "@/lib/patches/patch-service";
import type { SynthView } from "@/lib/synths/synth-service";

/**
 * The browser's one way to call the app's API: paths, encoding, caching and error bodies live here.
 * Every call resolves (never rejects); `status` 0 means the request did not reach the server.
 */
export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error?: string; body: Record<string, unknown> };

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Sent as JSON. */
  json?: unknown;
  /** Sent as is (file uploads). */
  body?: BodyInit;
  signal?: AbortSignal;
}

const segment = encodeURIComponent;

/** Dispatched on window when the API refuses the session (401), e.g. because an admin deactivated the account. */
export const UNAUTHORIZED_EVENT = "patch-sheet:unauthorized";

async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const method = options.method ?? "GET";
  // Reads always ask the server: libraries and synths change while the page is open.
  const init: RequestInit =
    method === "GET" ? { cache: "no-store" } : { method };
  if (options.json !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(options.json);
  } else if (options.body !== undefined) {
    init.body = options.body;
  }
  if (options.signal) init.signal = options.signal;
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { ok: false, status: 0, body: {} };
  }
  if (response.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  const body: unknown = await response.json().catch(() => ({}));
  if (response.ok) return { ok: true, status: response.status, data: body as T };
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  return { ok: false, status: response.status, error: typeof record.error === "string" ? record.error : undefined, body: record };
}

export interface SynthCatalogItem {
  slug: string;
  displayName: string;
  isBuiltIn: boolean;
  /** False while the synth awaits an admin's approval (only its owner and admins see it then). */
  approved: boolean;
}

export interface SynthRevisionInput {
  displayName: string;
  slug: string;
  manufacturer: string;
  controls: unknown[];
  categories?: unknown[];
  expectedRevision?: number;
  panelAssetId?: string;
}

export interface UploadedPanel {
  id: string;
  url: string;
  width: number;
  height: number;
}

export type StoredSample = NonNullable<PatchView["sample"]>;

type NewPatch = Pick<PatchRecord, "id" | "name"> & { synthSlug: string; data: PatchData };
type ImportedPatch = Pick<PatchRecord, "id" | "name" | "data">;

export const api = {
  synths: {
    list: () => request<{ synths: SynthCatalogItem[] }>("/api/synths"),
    get: (slug: string) => request<SynthView>(`/api/synths/${segment(slug)}`),
    create: (input: SynthRevisionInput) => request<{ slug: string }>("/api/synths", { method: "POST", json: input }),
    saveRevision: (slug: string, input: SynthRevisionInput) =>
      request<{ revision?: number }>(`/api/synths/${segment(slug)}/revisions`, { method: "POST", json: input }),
    remove: (slug: string) => request<unknown>(`/api/synths/${segment(slug)}`, { method: "DELETE" }),
  },
  patches: {
    listStates: (synthSlug: string) => request<{ patches: PatchState[] }>(`/api/patches?synth=${segment(synthSlug)}`),
    get: (id: string) => request<PatchView>(`/api/patches/${segment(id)}`),
    create: (patch: NewPatch) => request<{ revision: number }>("/api/patches", { method: "POST", json: patch }),
    update: (id: string, changes: Record<string, unknown>) =>
      request<{ revision: number }>(`/api/patches/${segment(id)}`, { method: "PATCH", json: changes }),
    remove: (id: string) => request<unknown>(`/api/patches/${segment(id)}`, { method: "DELETE" }),
    import: (synthSlug: string, patches: readonly ImportedPatch[]) =>
      request<unknown>("/api/patches/import", { method: "POST", json: { synthSlug, patches } }),
    uploadSample: (id: string, file: File, meta: Record<string, string>) =>
      request<{ sample?: StoredSample }>(`/api/patches/${segment(id)}/sample?${new URLSearchParams(meta).toString()}`, {
        method: "POST",
        body: file,
      }),
  },
  admin: {
    setSynthApproval: (slug: string, approved: boolean) =>
      request<{ ok: true; approved: boolean }>(`/api/admin/synths/${segment(slug)}`, { method: "PATCH", json: { approved } }),
    /** Soft delete (restorable) or restore. */
    setSynthDeleted: (slug: string, deleted: boolean) =>
      request<{ ok: true; deleted: boolean }>(`/api/admin/synths/${segment(slug)}`, { method: "PATCH", json: { deleted } }),
    /** Removes a soft-deleted synth for good. */
    purgeSynth: (slug: string) => request<unknown>(`/api/admin/synths/${segment(slug)}`, { method: "DELETE" }),
    /** One change per call: { active } | { emailVerified } | { role }; answers the applied change. */
    changeUser: <Change extends { active: boolean } | { emailVerified: boolean } | { role: "user" | "admin" }>(id: string, change: Change) =>
      request<Change>(`/api/admin/users/${segment(id)}`, { method: "PATCH", json: change }),
    /** The database part of a backup and where to fetch each file (see the backup admin section). */
    backupData: () => request<{ manifest: BackupManifest; tables: BackupTables; fileUrls: Record<string, string> }>("/api/admin/backup"),
    backupUploadTargets: (keys: readonly string[]) =>
      request<{ targets: Record<string, UploadTarget> }>("/api/admin/backup/upload-targets", { method: "POST", json: { keys } }),
    restoreBackup: (backup: { manifest: BackupManifest; tables: BackupTables }) =>
      request<{ ok: true }>("/api/admin/backup/restore", { method: "POST", json: backup }),
    reduceRevisions: (slug: string) => request<{ ok: true; removed: number }>(`/api/admin/synths/${segment(slug)}/revisions`, { method: "DELETE" }),
  },
  tags: {
    suggest: (query: string, signal?: AbortSignal) => request<{ tags?: TagEntry[] }>(`/api/tags?q=${segment(query)}`, { signal }),
  },
  instruments: {
    /** Raw layout JSON of a built-in instrument; decoding belongs to the instrument layout adapter. */
    getLayout: (id: string) => request<unknown>(`/api/instruments/${segment(id)}/layout`),
    saveLayout: (id: string, layout: unknown) => request<unknown>(`/api/instruments/${segment(id)}/layout`, { method: "PUT", json: layout }),
  },
  assets: {
    uploadPanel: (file: File) => request<{ panel?: UploadedPanel }>("/api/assets?kind=panel", { method: "POST", body: file }),
  },
};
