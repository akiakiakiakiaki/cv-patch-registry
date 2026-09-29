import type { PatchPort, Point } from '@/lib/instrument/layout';

export function cableCurve(start: Point, end: Point): string {
  const width = end.x - start.x;
  const arc = Math.max(22, Math.abs(width) * 0.13);
  return `M ${start.x} ${start.y} C ${start.x + width * 0.25} ${start.y + arc}, ${end.x - width * 0.25} ${end.y + arc}, ${end.x} ${end.y}`;
}

export function getNearestPort(point: Point, ports: readonly PatchPort[], radius: number): PatchPort | undefined {
  return ports.find((port) => Math.hypot(port.x - point.x, port.y - point.y) < radius);
}
