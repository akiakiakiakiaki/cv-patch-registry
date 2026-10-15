import type { KeyboardEvent } from "react";
import type { PatchCable } from "@/lib/domain/types";
import type { PatchCableColorId } from "@/lib/domain/patch-colors";
import { normalizeCableEndpoints } from "@/lib/domain/port-rules";
import type { PatchPort, Point } from "@/lib/instrument/layout";

export function normalizedCable(
  from: PatchPort,
  to: PatchPort,
  colorId: PatchCableColorId,
): PatchCable {
  return { ...normalizeCableEndpoints(from, to), colorId };
}

export function eventPoint(
  svg: SVGSVGElement,
  event: { clientX: number; clientY: number },
): Point {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const matrix = svg.getScreenCTM();
  const localPoint = matrix ? point.matrixTransform(matrix.inverse()) : point;
  return { x: localPoint.x, y: localPoint.y };
}

export function handleKeyboardToggle(
  event: KeyboardEvent<SVGElement>,
  toggle: () => void,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    toggle();
  }
}
