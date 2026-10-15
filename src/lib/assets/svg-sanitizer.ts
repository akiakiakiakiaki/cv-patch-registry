import DOMPurify from "isomorphic-dompurify";
import { dimensionsWithinLimits } from "@/lib/assets/image-header";

/**
 * Runs only inside the upload route (Node runtime), never on the serving path.
 * Policy: the upload is rejected, not silently cleaned, whenever anything outside the allowlist
 * is found. A stored SVG is therefore always the document the user actually uploaded (minus formatting).
 */
export const SVG_MAX_BYTES = 5 * 1024 * 1024;
const MAX_ELEMENTS = 10_000;
const MAX_DEPTH = 64;

const ALLOWED_TAGS = [
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "defs", "lineargradient", "radialgradient", "stop", "clippath",
  "title", "desc", "style", "#text",
];

const ALLOWED_ATTR = [
  "id", "class", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "width", "height", "d", "points", "viewbox", "preserveaspectratio", "transform",
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-linecap",
  "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset",
  "stroke-opacity", "opacity", "offset", "stop-color", "stop-opacity", "gradientunits",
  "gradienttransform", "clip-path", "clip-rule", "font-family", "font-size",
  "font-weight", "text-anchor", "dominant-baseline", "style", "xmlns", "xmlns:xlink",
  "version", "href", "xlink:href",
];

/** Values that can run code or load something external, anywhere in an attribute. */
const UNSAFE_VALUE = /javascript:|expression\s*\(|@import|url\s*\(\s*(?!['"]?#)|behavior\s*:|-moz-binding/i;
/** Stylesheet content: only plain declarations, no at-rules, no external URLs, no escapes. */
const UNSAFE_STYLE = /@|url\s*\(\s*(?!['"]?#)|expression|javascript|\\|behavior|-moz-binding|[<>]/i;
const LOCAL_REFERENCE = /^#[A-Za-z_][\w.-]*$/;

export type SvgRejection =
  | "too-large"
  | "invalid-encoding"
  | "doctype-or-entity"
  | "not-svg"
  | "too-many-elements"
  | "too-deep"
  | "unsupported-content"
  | "malformed"
  | "no-size"
  | "dimensions";

export type SvgResult =
  | { ok: true; svg: string; width: number; height: number }
  | { ok: false; reason: SvgRejection };

interface RunState {
  rejected: boolean;
}

let runState: RunState = { rejected: false };

DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
  const name = data.attrName.toLowerCase();
  const value = data.attrValue;
  if (name === "href" || name === "xlink:href") {
    if (!LOCAL_REFERENCE.test(value.trim())) data.keepAttr = false;
  }
  if (UNSAFE_VALUE.test(value)) data.keepAttr = false;
});

DOMPurify.addHook("uponSanitizeElement", (node, data) => {
  if (data.tagName !== "style") return;
  if (UNSAFE_STYLE.test(node.textContent ?? "")) {
    runState.rejected = true;
    node.textContent = "";
  }
});

/** DOMPurify reports its internal BODY wrapper as removed. Only real element or attribute removals count. */
function isRealRemoval(entry: { element?: Node | null; attribute?: Attr | null } | undefined): boolean {
  if (!entry) return false;
  if (entry.attribute) return true;
  return !!entry.element && entry.element.nodeName !== "BODY";
}

/** Counts elements and nesting on the raw text, before any DOM is built. Comments and CDATA are not markup. */
export function measureStructure(text: string): { elements: number; depth: number } {
  const markup = text.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const tag = /<(\/?)([A-Za-z][\w:.-]*)[^>]*?(\/?)>/g;
  let depth = 0;
  let maxDepth = 0;
  let elements = 0;
  for (const match of markup.matchAll(tag)) {
    const [, closing, , selfClosing] = match;
    if (closing) {
      depth -= 1;
      continue;
    }
    elements += 1;
    if (selfClosing) continue;
    depth += 1;
    maxDepth = Math.max(maxDepth, depth);
  }
  return { elements, depth: maxDepth };
}

export function readSvgSize(svg: string): { width: number; height: number } | null {
  const root = /<svg\b[^>]*>/i.exec(svg)?.[0];
  if (!root) return null;
  const viewBox = /\sviewBox\s*=\s*["']([^"']+)["']/i.exec(root)?.[1];
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2]! > 0 && parts[3]! > 0) {
      return { width: parts[2]!, height: parts[3]! };
    }
    return null;
  }
  const width = /\swidth\s*=\s*["']([\d.]+)(?:px)?["']/i.exec(root)?.[1];
  const height = /\sheight\s*=\s*["']([\d.]+)(?:px)?["']/i.exec(root)?.[1];
  if (width && height) return { width: Number(width), height: Number(height) };
  return null;
}

export function sanitizeSvg(input: Uint8Array): SvgResult {
  if (input.byteLength > SVG_MAX_BYTES) return { ok: false, reason: "too-large" };

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    return { ok: false, reason: "invalid-encoding" };
  }
  if (/<!(DOCTYPE|ENTITY)/i.test(text)) return { ok: false, reason: "doctype-or-entity" };
  if (!/<svg[\s>]/i.test(text)) return { ok: false, reason: "not-svg" };

  const structure = measureStructure(text);
  if (structure.elements > MAX_ELEMENTS) return { ok: false, reason: "too-many-elements" };
  if (structure.depth > MAX_DEPTH) return { ok: false, reason: "too-deep" };

  runState = { rejected: false };
  DOMPurify.removed = [];
  const svg = DOMPurify.sanitize(text, {
    PARSER_MEDIA_TYPE: "image/svg+xml",
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    KEEP_CONTENT: false,
    RETURN_DOM: false,
  }) as unknown as string;
  const removedAnything = DOMPurify.removed.some(isRealRemoval);
  if (runState.rejected || removedAnything) return { ok: false, reason: "unsupported-content" };
  if (!svg.trim().startsWith("<svg")) return { ok: false, reason: "malformed" };

  const size = readSvgSize(svg);
  if (!size) return { ok: false, reason: "no-size" };
  if (!dimensionsWithinLimits(Math.round(size.width), Math.round(size.height))) {
    return { ok: false, reason: "dimensions" };
  }
  return { ok: true, svg: svg.trim(), ...size };
}

