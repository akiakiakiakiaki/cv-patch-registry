/** Page padding shared by header, bars, content and footers (horizontal, or all sides for content areas). */
export const PAGE_GUTTER = { xs: 2, md: 3 } as const;

/** Hides content visually but keeps it for screen readers (e.g. the name of an icon-only column). */
export const VISUALLY_HIDDEN = {
  border: 0,
  clip: "rect(0 0 0 0)",
  height: "1px",
  margin: "-1px",
  overflow: "hidden",
  padding: 0,
  position: "absolute",
  whiteSpace: "nowrap",
  width: "1px",
} as const;
