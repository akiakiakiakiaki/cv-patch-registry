/** Limits for raster and vector panels. Checked from headers before any decoding. */
export const IMAGE_LIMITS = { maxEdge: 8000, maxPixels: 40_000_000 } as const;

export type RasterKind = "png" | "jpg";

export interface RasterInfo {
  kind: RasterKind;
  width: number;
  height: number;
  /** EXIF orientation. Anything other than 1 would rotate the image relative to the stored dimensions. */
  orientation: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function u16(bytes: Uint8Array, offset: number, littleEndian = false): number {
  return littleEndian
    ? bytes[offset]! | (bytes[offset + 1]! << 8)
    : (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function u32(bytes: Uint8Array, offset: number, littleEndian = false): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
  return view.getUint32(0, littleEndian);
}

export function detectRaster(bytes: Uint8Array): RasterKind | null {
  if (PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}

function readPng(bytes: Uint8Array): RasterInfo | null {
  if (bytes.byteLength < 24) return null;
  const chunkType = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
  if (chunkType !== "IHDR") return null;
  return { kind: "png", width: u32(bytes, 16), height: u32(bytes, 20), orientation: 1 };
}

function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function readExifOrientation(bytes: Uint8Array, segmentStart: number, segmentLength: number): number {
  const exif = segmentStart + 4;
  const isExif = String.fromCharCode(...bytes.subarray(exif, exif + 6)) === "Exif\0\0";
  if (!isExif) return 1;
  const tiff = exif + 6;
  const littleEndian = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  const ifd = tiff + u32(bytes, tiff + 4, littleEndian);
  if (ifd + 2 > segmentStart + segmentLength) return 1;
  const entries = u16(bytes, ifd, littleEndian);
  for (let index = 0; index < entries; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > bytes.byteLength) break;
    if (u16(bytes, entry, littleEndian) === 0x0112) return u16(bytes, entry + 8, littleEndian);
  }
  return 1;
}

function readJpeg(bytes: Uint8Array): RasterInfo | null {
  let orientation = 1;
  let offset = 2;
  while (offset + 4 <= bytes.byteLength) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = u16(bytes, offset + 2);
    if (marker === 0xe1) orientation = readExifOrientation(bytes, offset, length + 2);
    if (isStartOfFrame(marker)) {
      if (offset + 9 > bytes.byteLength) return null;
      return {
        kind: "jpg",
        height: u16(bytes, offset + 5),
        width: u16(bytes, offset + 7),
        orientation,
      };
    }
    offset += 2 + length;
  }
  return null;
}

/** Reads dimensions from the file header only. Returns null for unreadable or truncated files. */
export function readRasterInfo(bytes: Uint8Array): RasterInfo | null {
  const kind = detectRaster(bytes);
  if (kind === "png") return readPng(bytes);
  if (kind === "jpg") return readJpeg(bytes);
  return null;
}

export function dimensionsWithinLimits(width: number, height: number): boolean {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return false;
  if (width < 1 || height < 1) return false;
  if (width > IMAGE_LIMITS.maxEdge || height > IMAGE_LIMITS.maxEdge) return false;
  return width * height <= IMAGE_LIMITS.maxPixels;
}
