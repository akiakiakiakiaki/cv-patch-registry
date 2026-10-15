import { describe, expect, it } from "vitest";
import {
  UPLOAD_HEADERS,
  contentTypeForKey,
  isValidUploadKey,
  uploadFilePath,
  uploadPublicUrl,
} from "@/lib/storage/upload-files";

const KEY = "0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f";

describe("upload file rules", () => {
  it("accepts generated UUID keys with known extensions", () => {
    expect(isValidUploadKey(`${KEY}.svg`)).toBe(true);
    expect(isValidUploadKey(`${KEY}.png`)).toBe(true);
    expect(isValidUploadKey(`${KEY}.jpg`)).toBe(true);
    expect(isValidUploadKey(`${KEY}.mp3`)).toBe(true);
  });

  it("rejects traversal, foreign names and unknown extensions", () => {
    expect(isValidUploadKey("../package.json")).toBe(false);
    expect(isValidUploadKey(`${KEY}.html`)).toBe(false);
    expect(isValidUploadKey("panel.svg")).toBe(false);
    expect(() => uploadFilePath("../secret")).toThrow("Invalid upload key");
  });

  it("maps extensions to content types", () => {
    expect(contentTypeForKey(`${KEY}.svg`)).toBe("image/svg+xml");
    expect(contentTypeForKey(`${KEY}.mp3`)).toBe("audio/mpeg");
  });

  it("derives the public URL from the storage key only", () => {
    expect(uploadPublicUrl(`${KEY}.png`)).toBe(`/assets/uploads/${KEY}.png`);
  });

  it("sends nosniff and a sandboxing CSP", () => {
    expect(UPLOAD_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(UPLOAD_HEADERS["Content-Security-Policy"]).toContain("sandbox");
  });
});
