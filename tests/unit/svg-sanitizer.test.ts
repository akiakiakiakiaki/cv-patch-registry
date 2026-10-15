import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SVG_MAX_BYTES, measureStructure, sanitizeSvg } from "@/lib/assets/svg-sanitizer";

const FIXTURES = path.join(process.cwd(), "tests", "fixtures", "svg");
const load = (name: string) => new Uint8Array(readFileSync(path.join(FIXTURES, name)));
const encode = (text: string) => new TextEncoder().encode(text);

describe("SVG sanitizer: accepted input", () => {
  it("accepts a clean panel and returns its viewBox size and markup", () => {
    const result = sanitizeSvg(load("clean.svg"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result).toMatchObject({ width: 400, height: 200 });
    expect(result.svg.startsWith("<svg")).toBe(true);
    expect(result.svg).toContain("linearGradient");
    expect(result.svg).toContain('fill="url(#shade)"');
  });

  it("falls back to width and height when there is no viewBox", () => {
    const result = sanitizeSvg(encode('<svg xmlns="http://www.w3.org/2000/svg" width="120px" height="80"><rect width="1" height="1"/></svg>'));
    expect(result).toMatchObject({ ok: true, width: 120, height: 80 });
  });
});

describe("SVG sanitizer: rejected input", () => {
  const cases: [string, string][] = [
    ["script.svg", "unsupported-content"],
    ["event-handler.svg", "unsupported-content"],
    ["foreign-object.svg", "unsupported-content"],
    ["external-use.svg", "unsupported-content"],
    ["javascript-href.svg", "unsupported-content"],
    ["doctype.svg", "doctype-or-entity"],
    ["entity.svg", "doctype-or-entity"],
    ["import-css.svg", "unsupported-content"],
    ["url-css.svg", "unsupported-content"],
    ["url-style-attr.svg", "unsupported-content"],
    ["plain-text.svg", "not-svg"],
  ];

  for (const [file, reason] of cases) {
    it(`rejects ${file} with ${reason}`, () => {
      expect(sanitizeSvg(load(file))).toEqual({ ok: false, reason });
    });
  }

  it("rejects files above the size limit", () => {
    const padding = "a".repeat(SVG_MAX_BYTES);
    expect(sanitizeSvg(encode(`<svg viewBox="0 0 1 1">${padding}</svg>`))).toEqual({ ok: false, reason: "too-large" });
  });

  it("rejects invalid UTF-8", () => {
    const bytes = new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0x3e, 0xff, 0xfe, 0x3c, 0x2f, 0x73, 0x76, 0x67, 0x3e]);
    expect(sanitizeSvg(bytes)).toEqual({ ok: false, reason: "invalid-encoding" });
  });

  it("rejects deeply nested documents", () => {
    const depth = 80;
    const markup = `<svg viewBox="0 0 1 1">${"<g>".repeat(depth)}${"</g>".repeat(depth)}</svg>`;
    expect(sanitizeSvg(encode(markup))).toEqual({ ok: false, reason: "too-deep" });
  });

  it("rejects documents with too many elements", () => {
    const markup = `<svg viewBox="0 0 1 1">${"<rect/>".repeat(10_001)}</svg>`;
    expect(sanitizeSvg(encode(markup))).toEqual({ ok: false, reason: "too-many-elements" });
  });

  it("rejects absurd dimensions", () => {
    expect(sanitizeSvg(encode('<svg viewBox="0 0 9000 10"><rect width="1" height="1"/></svg>'))).toEqual({
      ok: false,
      reason: "dimensions",
    });
  });

  it("rejects a viewBox without a usable size", () => {
    expect(sanitizeSvg(encode('<svg viewBox="0 0 0 0"><rect width="1" height="1"/></svg>'))).toEqual({
      ok: false,
      reason: "no-size",
    });
  });

  it("rejects a root with no size information at all", () => {
    expect(sanitizeSvg(encode('<svg><rect width="1" height="1"/></svg>'))).toEqual({ ok: false, reason: "no-size" });
  });
});

describe("structure measurement", () => {
  it("ignores comments and CDATA when counting", () => {
    const measured = measureStructure("<svg><!-- <g><g> --><![CDATA[<g>]]><rect/></svg>");
    expect(measured).toEqual({ elements: 2, depth: 1 });
  });
});
