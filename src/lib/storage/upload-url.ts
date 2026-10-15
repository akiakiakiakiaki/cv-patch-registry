/** Client-safe: no Node imports. Used by components to tell uploaded panels from bundled assets. */
export const UPLOAD_URL_PREFIX = "/assets/uploads";

export function uploadPublicUrl(key: string): string {
  return `${UPLOAD_URL_PREFIX}/${key}`;
}

export function isUploadedAssetUrl(src: string): boolean {
  return src.startsWith(`${UPLOAD_URL_PREFIX}/`);
}
