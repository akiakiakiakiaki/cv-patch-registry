import type { PortKind } from "@/lib/domain/port-rules";
import { readSchemaMinor } from "@/lib/domain/schema-version";
import type { InstrumentLayout, PatchPort, Point } from "@/lib/instrument/layout";
import { normalizePixelPosition } from "@/lib/instrument/pixel-position";

/** Highest layout minor this app can read. Minor 1 adds the `uni` port kind. */
export const LAYOUT_SCHEMA_MINOR = 1;

const PORT_KINDS: readonly PortKind[] = ["in", "out", "uni"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPosition(
  candidate: Record<string, unknown>,
  viewBox: InstrumentLayout["viewBox"],
): Point | null {
  if (typeof candidate.x !== "number" || !Number.isFinite(candidate.x)) return null;
  if (typeof candidate.y !== "number" || !Number.isFinite(candidate.y)) return null;
  if (candidate.x < 0 || candidate.x > viewBox.width) return null;
  if (candidate.y < 0 || candidate.y > viewBox.height) return null;
  return {
    x: normalizePixelPosition(candidate.x, viewBox.width),
    y: normalizePixelPosition(candidate.y, viewBox.height),
  };
}

function readLabel(candidate: Record<string, unknown>): string | undefined {
  return typeof candidate.label === "string" && candidate.label.trim() ? candidate.label : undefined;
}

function decodePoints<T extends Point & { id: string; label?: string }>(
  value: unknown,
  reference: readonly T[],
  viewBox: InstrumentLayout["viewBox"],
): T[] | null {
  if (!Array.isArray(value) || value.length !== reference.length) return null;
  const decoded: T[] = [];

  for (const [index, referencePoint] of reference.entries()) {
    const candidate: unknown = value[index];
    if (!isRecord(candidate) || candidate.id !== referencePoint.id) return null;
    const position = readPosition(candidate, viewBox);
    if (!position) return null;
    const label = readLabel(candidate);
    decoded.push({ ...referencePoint, ...position, ...(label ? { label } : {}) });
  }

  return decoded;
}

function decodePorts(
  value: unknown,
  reference: readonly PatchPort[],
  viewBox: InstrumentLayout["viewBox"],
): PatchPort[] | null {
  if (!Array.isArray(value) || value.length !== reference.length) return null;
  const decoded: PatchPort[] = [];

  for (const [index, referencePort] of reference.entries()) {
    const candidate: unknown = value[index];
    if (!isRecord(candidate) || candidate.id !== referencePort.id) return null;
    const kind = candidate.kind;
    if (typeof kind !== "string" || !PORT_KINDS.includes(kind as PortKind)) return null;
    const position = readPosition(candidate, viewBox);
    if (!position) return null;
    const label = readLabel(candidate) ?? referencePort.label;
    decoded.push({ ...referencePort, ...position, kind: kind as PortKind, label });
  }

  return decoded;
}

export function decodeInstrumentLayout(
  value: unknown,
  reference: InstrumentLayout,
): InstrumentLayout | null {
  if (!isRecord(value)) return null;
  if (
    value.schemaVersion !== reference.schemaVersion ||
    value.id !== reference.id
  )
    return null;
  if (readSchemaMinor(value.schemaMinor, LAYOUT_SCHEMA_MINOR) === null) return null;
  const isLegacyProtonLayout =
    reference.id === "behringer-proton" &&
    value.layoutVersion === undefined &&
    value.displayName === undefined;
  if (!isLegacyProtonLayout && value.layoutVersion !== reference.layoutVersion)
    return null;
  if (!isLegacyProtonLayout && value.displayName !== reference.displayName)
    return null;
  if (!isRecord(value.viewBox)) return null;
  if (
    value.viewBox.width !== reference.viewBox.width ||
    value.viewBox.height !== reference.viewBox.height
  )
    return null;
  if (
    value.knobStartAngle !== reference.knobStartAngle ||
    value.knobSweepAngle !== reference.knobSweepAngle
  )
    return null;

  const knobs = decodePoints(value.knobs, reference.knobs, reference.viewBox);
  const switches = decodePoints(
    value.switches,
    reference.switches,
    reference.viewBox,
  );
  const leds = decodePoints(value.leds, reference.leds, reference.viewBox);
  const ports = decodePorts(value.ports, reference.ports, reference.viewBox);
  if (!knobs || !switches || !leds || !ports) return null;

  return { ...reference, knobs, switches, leds, ports };
}

/**
 * Writer: the lowest schemaMinor the content needs. A layout without uni ports is written
 * without schemaMinor, so it stays byte-identical to legacy 1.0 documents.
 */
export function encodeInstrumentLayout(layout: InstrumentLayout): InstrumentLayout {
  const document: InstrumentLayout = { ...layout };
  delete document.schemaMinor;
  const minor = layout.ports.some((port) => port.kind === "uni") ? 1 : 0;
  return minor > 0 ? { ...document, schemaMinor: minor } : document;
}
