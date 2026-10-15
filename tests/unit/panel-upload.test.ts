import { describe, expect, it } from "vitest";
import { validatePanelUpload } from "@/lib/assets/panel-upload";
import { readRasterInfo, dimensionsWithinLimits } from "@/lib/assets/image-header";

/** Minimal PNG header: signature plus IHDR with the given size. Enough for the header parser. */
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** JPEG with an SOF0 frame and an optional EXIF APP1 orientation tag (little-endian TIFF). */
function jpegHeader(width: number, height: number, orientation?: number): Uint8Array {
  const exif = orientation === undefined ? [] : [
    0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ];
  const sof = [0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x01, 0x01, 0x11, 0x00];
  return new Uint8Array([0xff, 0xd8, ...exif, ...sof, 0xff, 0xd9]);
}

describe("raster header parsing", () => {
  it("reads PNG dimensions from IHDR", () => {
    expect(readRasterInfo(pngHeader(640, 480))).toEqual({ kind: "png", width: 640, height: 480, orientation: 1 });
  });

  it("reads JPEG dimensions from the start-of-frame marker", () => {
    expect(readRasterInfo(jpegHeader(800, 300))).toEqual({ kind: "jpg", width: 800, height: 300, orientation: 1 });
  });

  it("reads a JPEG EXIF orientation", () => {
    expect(readRasterInfo(jpegHeader(800, 300, 6))?.orientation).toBe(6);
  });

  it("returns null for a PNG whose first chunk is not IHDR", () => {
    const bytes = pngHeader(1, 1);
    bytes.set([0x58, 0x58, 0x58, 0x58], 12);
    expect(readRasterInfo(bytes)).toBeNull();
  });

  it("returns null for truncated input", () => {
    expect(readRasterInfo(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
  });
});

describe("dimension limits", () => {
  it("allows panels up to 8000 px per edge and 40 MP", () => {
    expect(dimensionsWithinLimits(8000, 5000)).toBe(true);
    expect(dimensionsWithinLimits(8001, 100)).toBe(false);
    expect(dimensionsWithinLimits(7000, 6000)).toBe(false);
    expect(dimensionsWithinLimits(0, 10)).toBe(false);
  });
});

describe("validatePanelUpload", () => {
  it("accepts a PNG and reports its size", () => {
    expect(validatePanelUpload(pngHeader(320, 200))).toMatchObject({ ok: true, panel: { kind: "png", width: 320, height: 200 } });
  });

  it("accepts a JPEG", () => {
    expect(validatePanelUpload(jpegHeader(320, 200))).toMatchObject({ ok: true, panel: { kind: "jpg" } });
  });

  it("rejects a rotated JPEG", () => {
    expect(validatePanelUpload(jpegHeader(320, 200, 6))).toEqual({ ok: false, reason: "orientation" });
  });

  it("rejects a raster that is too large", () => {
    expect(validatePanelUpload(pngHeader(9000, 9000))).toEqual({ ok: false, reason: "dimensions" });
  });

  it("rejects a truncated image with a PNG or JPEG signature", () => {
    expect(validatePanelUpload(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({
      ok: false,
      reason: "unreadable-image",
    });
  });

  it("routes SVG through the sanitizer and stores the sanitized text", () => {
    const result = validatePanelUpload(new TextEncoder().encode('<svg viewBox="0 0 30 20"><rect width="1" height="1"/></svg>'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.panel).toMatchObject({ kind: "svg", width: 30, height: 20 });
    expect(new TextDecoder().decode(result.panel.bytes).startsWith("<svg")).toBe(true);
  });

  it("rejects unknown binary content", () => {
    expect(validatePanelUpload(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toEqual({ ok: false, reason: "not-svg" });
  });
});
