import path from "node:path";
import uploadSecurityHeaders from "@/lib/storage/upload-security-headers.json";
import { contentTypeForKey, isValidUploadKey, uploadPublicUrl } from "@/lib/storage/upload-url";

export { contentTypeForKey, isValidUploadKey, uploadPublicUrl };

// Marked for the bundler: local uploads are development data and must not be traced into server functions.
export const UPLOAD_DIRECTORY = path.join(/* turbopackIgnore: true */ process.cwd(), "public", "assets", "uploads");

export function uploadFilePath(key: string): string {
  if (!isValidUploadKey(key)) throw new Error("Invalid upload key");
  return path.join(UPLOAD_DIRECTORY, key);
}

export const UPLOAD_HEADERS: Readonly<Record<string, string>> = Object.fromEntries(
  uploadSecurityHeaders.map(({ key, value }) => [key, value]),
);
