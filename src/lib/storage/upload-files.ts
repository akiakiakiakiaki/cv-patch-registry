import path from "node:path";
import uploadSecurityHeaders from "@/lib/storage/upload-security-headers.json";
import { uploadPublicUrl } from "@/lib/storage/upload-url";

export { uploadPublicUrl };

export const UPLOAD_DIRECTORY = path.join(process.cwd(), "public", "assets", "uploads");

const UPLOAD_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(svg|png|jpg|mp3)$/;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  mp3: "audio/mpeg",
};

export function isValidUploadKey(key: string): boolean {
  return UPLOAD_KEY_PATTERN.test(key);
}

export function uploadFilePath(key: string): string {
  if (!isValidUploadKey(key)) throw new Error("Invalid upload key");
  return path.join(UPLOAD_DIRECTORY, key);
}

export function contentTypeForKey(key: string): string {
  const extension = key.slice(key.lastIndexOf(".") + 1);
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

export const UPLOAD_HEADERS: Readonly<Record<string, string>> = Object.fromEntries(
  uploadSecurityHeaders.map(({ key, value }) => [key, value]),
);
