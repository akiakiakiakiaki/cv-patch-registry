export function normalizePixelPosition(value: number, maximum: number): number {
  const nearestHalfPixel = Math.round(value * 2) / 2;
  const maximumHalfPixel = Math.floor(maximum * 2) / 2;
  return Math.max(0, Math.min(maximumHalfPixel, nearestHalfPixel));
}
