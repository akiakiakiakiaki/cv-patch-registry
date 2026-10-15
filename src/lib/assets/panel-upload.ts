import { readRasterInfo, dimensionsWithinLimits, type RasterKind } from "@/lib/assets/image-header";
import { sanitizeSvg, type SvgRejection } from "@/lib/assets/svg-sanitizer";

export type PanelKind = RasterKind | "svg";

export interface ValidPanel {
  kind: PanelKind;
  bytes: Uint8Array;
  width: number;
  height: number;
}

export type PanelRejection = SvgRejection | "unsupported-type" | "unreadable-image" | "orientation" | "dimensions";

export type PanelResult = { ok: true; panel: ValidPanel } | { ok: false; reason: PanelRejection };

/** Decides the type from the bytes, never from the file name or the Content-Type header. */
export function validatePanelUpload(bytes: Uint8Array): PanelResult {
  const raster = readRasterInfo(bytes);
  if (raster) {
    if (raster.orientation !== 1) return { ok: false, reason: "orientation" };
    if (!dimensionsWithinLimits(raster.width, raster.height)) return { ok: false, reason: "dimensions" };
    return { ok: true, panel: { kind: raster.kind, bytes, width: raster.width, height: raster.height } };
  }

  const looksRasterButBroken = bytes[0] === 0x89 || (bytes[0] === 0xff && bytes[1] === 0xd8);
  if (looksRasterButBroken) return { ok: false, reason: "unreadable-image" };

  const svg = sanitizeSvg(bytes);
  if (!svg.ok) return { ok: false, reason: svg.reason };
  return {
    ok: true,
    panel: {
      kind: "svg",
      bytes: new TextEncoder().encode(svg.svg),
      width: Math.round(svg.width),
      height: Math.round(svg.height),
    },
  };
}
