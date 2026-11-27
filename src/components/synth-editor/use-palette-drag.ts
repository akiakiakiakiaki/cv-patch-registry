"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { eventPoint } from "@/components/instrument-panel/utils";
import type { PaletteItem } from "@/components/synth-editor/palette";
import type { Point } from "@/lib/instrument/layout";

/**
 * Dragging a control from the palette onto the panel: `start` on pointer down; while the pointer is over the panel,
 * `preview` holds the point in panel units; releasing there calls `onDrop`. Releasing elsewhere cancels.
 */
export function usePaletteDrag(
  panelRef: RefObject<SVGSVGElement | null>,
  panel: { width: number; height: number },
  onDrop: (item: PaletteItem, point: Point) => void,
) {
  const [dragItem, setDragItem] = useState<PaletteItem | null>(null);
  const [preview, setPreview] = useState<Point | null>(null);
  const dropRef = useRef(onDrop);
  useEffect(() => {
    dropRef.current = onDrop;
  });

  useEffect(() => {
    if (!dragItem) return;
    const locate = (event: PointerEvent): Point | null => {
      const svg = panelRef.current;
      if (!svg) return null;
      const point = eventPoint(svg, event);
      const inside = point.x >= 0 && point.x <= panel.width && point.y >= 0 && point.y <= panel.height;
      return inside ? point : null;
    };
    const stop = () => {
      setDragItem(null);
      setPreview(null);
    };
    // Only a real change of position renders again: browsers also send pointermove when the page changes
    // under a resting pointer, and a new object for the same point would answer every such event with a render.
    const move = (event: PointerEvent) => {
      const next = locate(event);
      setPreview((current) => (samePoint(current, next) ? current : next));
    };
    const drop = (event: PointerEvent) => {
      const point = locate(event);
      if (point) dropRef.current(dragItem, point);
      stop();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [dragItem, panel.width, panel.height, panelRef]);

  const placement = useMemo(() => (dragItem && preview ? { ...dragItem, point: preview } : null), [dragItem, preview]);
  return { start: setDragItem, dragging: dragItem !== null, placement };
}

function samePoint(left: Point | null, right: Point | null): boolean {
  return left === right || (left !== null && right !== null && left.x === right.x && left.y === right.y);
}
