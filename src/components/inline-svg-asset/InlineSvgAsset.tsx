"use client";

import { useEffect, useId, useState } from "react";
import type { CSSProperties } from "react";

interface InlineSvgAssetProps {
  className: string | undefined;
  src: string;
  label?: string;
  ariaHidden?: boolean;
  style?: CSSProperties;
}

function scopeSvgStyles(markup: string, scope: string): string {
  const classPrefix = `svg-${scope}`;
  const ids = new Map<string, string>();
  const withScopedIds = markup.replace(/\bid="([^"]+)"/g, (_match, id: string) => {
    const scopedId = `${classPrefix}-${id}`;
    ids.set(id, scopedId);
    return `id="${scopedId}"`;
  });
  const withScopedReferences = withScopedIds.replace(
    /url\(#([^)]*)\)|((?:xlink:)?href)="#([^"]+)"/g,
    (match, urlId: string | undefined, href: string | undefined, hrefId: string | undefined) => {
      if (urlId) return `url(#${ids.get(urlId) ?? `${classPrefix}-${urlId}`})`;
      return `${href}="#${ids.get(hrefId!) ?? `${classPrefix}-${hrefId}`}"`;
    },
  );

  return withScopedReferences
    .replace(/class="([^"]+)"/g, (_match, classes: string) => {
      const scopedClasses = classes
        .split(/\s+/)
        .map((className) => `${classPrefix}-${className}`)
        .join(" ");
      return `class="${scopedClasses}"`;
    })
    .replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_match, attributes: string, css: string) => {
      const scopedCss = css.replace(/\.([A-Za-z_][\w-]*)/g, `.${classPrefix}-$1`);
      return `<style${attributes}>${scopedCss}</style>`;
    });
}

export function InlineSvgAsset({
  className,
  src,
  label,
  ariaHidden = false,
  style,
}: InlineSvgAssetProps) {
  const reactId = useId();
  const scope = reactId.replace(/[^a-zA-Z0-9_-]/g, "");
  const [markup, setMarkup] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadSvg() {
      try {
        const response = await fetch(src, { signal: controller.signal });
        if (!response.ok) return;
        const svg = await response.text();
        if (!controller.signal.aborted) setMarkup(scopeSvgStyles(svg, scope));
      } catch {
        // Leave the asset empty if the local SVG cannot be loaded.
      }
    }

    setMarkup("");
    void loadSvg();
    return () => controller.abort();
  }, [scope, src]);

  return (
    <div
      className={className}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={ariaHidden || undefined}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
