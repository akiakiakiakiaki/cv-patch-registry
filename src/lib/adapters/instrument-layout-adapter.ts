import type { InstrumentLayout, Point } from "@/lib/instrument/layout";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodePoints<T extends Point & { id: string }>(
  value: unknown,
  reference: readonly T[],
  viewBox: InstrumentLayout["viewBox"],
): T[] | null {
  if (!Array.isArray(value) || value.length !== reference.length) return null;
  const decoded: T[] = [];

  for (const [index, referencePoint] of reference.entries()) {
    const candidate: unknown = value[index];
    if (!isRecord(candidate) || candidate.id !== referencePoint.id) return null;
    if (typeof candidate.x !== "number" || !Number.isFinite(candidate.x))
      return null;
    if (typeof candidate.y !== "number" || !Number.isFinite(candidate.y))
      return null;
    if (candidate.x < 0 || candidate.x > viewBox.width) return null;
    if (candidate.y < 0 || candidate.y > viewBox.height) return null;
    decoded.push({ ...referencePoint, x: candidate.x, y: candidate.y });
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
  const ports = decodePoints(value.ports, reference.ports, reference.viewBox);
  if (!knobs || !switches || !leds || !ports) return null;

  return { ...reference, knobs, switches, leds, ports };
}
