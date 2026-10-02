import type { KeyboardEvent } from "react";
import type { PatchCable } from "@/lib/domain/types";
import type { PatchCableColorId } from "@/lib/domain/patch-colors";
import type { PatchPort, Point } from "@/lib/instrument/layout";

export function normalizedCable(
  from: PatchPort,
  to: PatchPort,
  colorId: PatchCableColorId,
): PatchCable {
  const out = from.kind === "out" ? from : to;
  const input = from.kind === "in" ? from : to;
  return { from: out.id, to: input.id, colorId };
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
