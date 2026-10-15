/**
 * Reads an optional integer schemaMinor. A missing field means 0 (legacy documents).
 * Returns null for malformed values and for minors newer than this app supports, so
 * callers reject the document instead of guessing.
 */
export function readSchemaMinor(value: unknown, supportedMinor: number): number | null {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
  return value <= supportedMinor ? value : null;
}
