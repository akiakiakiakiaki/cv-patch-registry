import type { CategoryScale, ControlCategory, InstrumentGeometry, PatchPort, Point, SwitchStyle } from '@/lib/instrument/layout';

export function cableCurve(start: Point, end: Point): string {
  const width = end.x - start.x;
  const arc = Math.max(22, Math.abs(width) * 0.13);
  return `M ${start.x} ${start.y} C ${start.x + width * 0.25} ${start.y + arc}, ${end.x - width * 0.25} ${end.y + arc}, ${end.x} ${end.y}`;
}

export function getNearestPort(point: Point, ports: readonly PatchPort[], radius: number): PatchPort | undefined {
  return ports.find((port) => Math.hypot(port.x - point.x, port.y - point.y) < radius);
}

/** Size of a switch on the panel: a slide switch is twice as wide as a push button. */
export function switchRect(
  geometry: InstrumentGeometry['switch'],
  style: SwitchStyle | undefined,
): { width: number; height: number; cornerRadius: number } {
  return { width: style === 'slide' ? geometry.width * 2 : geometry.width, height: geometry.height, cornerRadius: geometry.cornerRadius };
}

/** Limits and step of a category's scale factor. */
export const CATEGORY_SCALE = { min: 0.25, max: 4, step: 0.05 } as const;

/** Width and height factors of a scale; missing means unscaled. */
export function scaleFactors(scale: CategoryScale | undefined): { x: number; y: number } {
  if (scale === undefined) return { x: 1, y: 1 };
  return typeof scale === 'number' ? { x: scale, y: scale } : scale;
}

/** Factors for a control of the given category (none, or an unknown one: unscaled). */
export function categoryScale(categories: readonly ControlCategory[] | undefined, categoryId: string | undefined): { x: number; y: number } {
  if (!categoryId) return { x: 1, y: 1 };
  return scaleFactors(categories?.find((category) => category.id === categoryId)?.scale);
}

/** Round controls keep their shape: they use the smaller of the two factors. */
export function roundFactor(factors: { x: number; y: number }): number {
  return Math.min(factors.x, factors.y);
}

/** A switch rectangle scaled by its category; the corner radius follows the smaller factor. */
export function scaleRect(rect: { width: number; height: number; cornerRadius: number }, factors: { x: number; y: number }) {
  return { width: rect.width * factors.x, height: rect.height * factors.y, cornerRadius: rect.cornerRadius * roundFactor(factors) };
}

