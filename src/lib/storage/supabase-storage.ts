import { randomUUID } from "node:crypto";
import { contentTypeForKey, isValidUploadKey } from "@/lib/storage/upload-url";
import type { StorageProvider, UploadExtension, UploadTarget } from "@/lib/storage/storage-provider";

function requiredSetting(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when STORAGE_PROVIDER=supabase`);
  return value;
}

function storageSecret(): string {
  const secret = process.env.SUPABASE_SECRET_KEY?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) {
    throw new Error("SUPABASE_SECRET_KEY is required when STORAGE_PROVIDER=supabase");
  }
  return secret;
}

function apiKeyHeaders(secret: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: secret };
  // New sb_secret keys are opaque API keys and must not be sent as bearer JWTs.
  // Legacy service_role keys are JWTs and continue to use Authorization as well.
  if (!secret.startsWith("sb_secret_")) headers.Authorization = `Bearer ${secret}`;
  return headers;
}

function objectUrl(projectUrl: string, bucket: string, key: string): string {
  return `${projectUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`;
}

async function throwStorageError(operation: string, response: Response): Promise<never> {
  const details = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 400);
  throw new Error(
    `Supabase Storage ${operation} failed with status ${response.status}${details ? `: ${details}` : ""}`,
  );
}

/** Supabase Storage implementation using its HTTP API and server-only credentials. */
export class SupabaseStorage implements StorageProvider {
  private readonly projectUrl = requiredSetting("SUPABASE_URL").replace(/\/+$/, "");
  private readonly bucket = requiredSetting("SUPABASE_STORAGE_BUCKET");
  private readonly secret = storageSecret();

  async put(bytes: Uint8Array, extension: UploadExtension): Promise<string> {
    const storageKey = `${randomUUID()}.${extension}`;
    const response = await fetch(objectUrl(this.projectUrl, this.bucket, storageKey), {
      method: "POST",
      headers: {
        ...apiKeyHeaders(this.secret),
        "Content-Type": contentTypeForKey(storageKey),
        "x-upsert": "false",
      },
      body: new Blob([bytes as unknown as BlobPart]),
      cache: "no-store",
    });
    if (!response.ok) {
      await throwStorageError("upload", response);
    }
    return storageKey;
  }

  async read(storageKey: string): Promise<Uint8Array> {
    if (!isValidUploadKey(storageKey)) throw new Error("Invalid storage key");
    const response = await fetch(objectUrl(this.projectUrl, this.bucket, storageKey), {
      headers: apiKeyHeaders(this.secret),
      cache: "no-store",
    });
    if (!response.ok) {
      await throwStorageError("download", response);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async remove(storageKey: string): Promise<void> {
    if (!isValidUploadKey(storageKey)) return;
    const response = await fetch(`${this.projectUrl}/storage/v1/object/${encodeURIComponent(this.bucket)}`, {
      method: "DELETE",
      headers: {
        ...apiKeyHeaders(this.secret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: [storageKey] }),
      cache: "no-store",
    });
    if (!response.ok) {
      await throwStorageError("delete", response);
    }
  }

  async putAt(storageKey: string, bytes: Uint8Array): Promise<void> {
    if (!isValidUploadKey(storageKey)) throw new Error("Invalid storage key");
    const response = await fetch(objectUrl(this.projectUrl, this.bucket, storageKey), {
      method: "POST",
      headers: { ...apiKeyHeaders(this.secret), "Content-Type": contentTypeForKey(storageKey), "x-upsert": "true" },
      body: new Blob([bytes as unknown as BlobPart]),
      cache: "no-store",
    });
    if (!response.ok) await throwStorageError("upload", response);
  }

  /** A signed upload URL: the browser sends the file straight to Supabase, replacing a file already there. */
  async uploadTarget(storageKey: string): Promise<UploadTarget> {
    if (!isValidUploadKey(storageKey)) throw new Error("Invalid storage key");
    const response = await fetch(
      `${this.projectUrl}/storage/v1/object/upload/sign/${encodeURIComponent(this.bucket)}/${encodeURIComponent(storageKey)}`,
      { method: "POST", headers: { ...apiKeyHeaders(this.secret), "x-upsert": "true", "Content-Type": "application/json" }, body: "{}", cache: "no-store" },
    );
    if (!response.ok) await throwStorageError("sign upload", response);
    const body = (await response.json()) as { url?: string };
    if (!body.url) throw new Error("Supabase Storage sign upload answered without a URL");
    return {
      url: `${this.projectUrl}/storage/v1${body.url}`,
      method: "PUT",
      headers: { "Content-Type": contentTypeForKey(storageKey), "x-upsert": "true" },
    };
  }

  publicUrl(storageKey: string): string {
    if (!isValidUploadKey(storageKey)) throw new Error("Invalid storage key");
    return `${this.projectUrl}/storage/v1/object/public/${encodeURIComponent(this.bucket)}/${encodeURIComponent(storageKey)}`;
  }
}
