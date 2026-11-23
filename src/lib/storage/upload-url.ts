/** Client-safe: no Node imports. Used by components to tell uploaded panels from bundled assets. */
export const UPLOAD_URL_PREFIX = "/assets/uploads";

const UPLOAD_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(svg|png|jpg|mp3|m4a)$/;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
};

export function uploadPublicUrl(key: string): string {
  return `${UPLOAD_URL_PREFIX}/${key}`;
}

export function isValidUploadKey(key: string): boolean {
  return UPLOAD_KEY_PATTERN.test(key);
}

export function contentTypeForKey(key: string): string {
  const extension = key.slice(key.lastIndexOf(".") + 1);
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

export function isUploadedAssetUrl(src: string): boolean {
  if (src.startsWith(`${UPLOAD_URL_PREFIX}/`)) return true;
  try {
    const url = new URL(src);
    return url.protocol === "https:" && url.pathname.includes("/storage/v1/object/public/");
  } catch {
    return false;
  }
}
