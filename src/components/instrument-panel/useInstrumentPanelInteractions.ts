"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { PatchCable, PatchData } from "@/lib/domain/types";
import {
  normalizePatchCableColor,
  PATCH_CABLE_COLORS,
} from "@/lib/domain/patch-colors";
import { cableCurve, getNearestPort } from "@/lib/instrument/geometry";
import type { InstrumentLayout, PatchPort, Point } from "@/lib/instrument/layout";
import { KNOB_VALUE_MAX, KNOB_VALUE_MIN } from "@/lib/domain/knob-range";
import type {
  CableColorPicker,
  CableGesture,
  CablePreview,
  EndpointClick,
} from "./types";
import { eventPoint, normalizedCable } from "./utils";

const ENDPOINT_DOUBLE_CLICK_DELAY = 400;

interface InteractionOptions {
  data: PatchData;
  layout: InstrumentLayout;
  layoutEditMode: boolean;
  onKnobChange: (id: string, value: number) => void;
  onCableChange: (cables: PatchCable[]) => void;
}

interface KnobGesture {
  id: string;
  startY: number;
  startValue: number;
  moved: boolean;
}

export function useInstrumentPanelInteractions({
  data,
  layout,
  layoutEditMode,
  onKnobChange,
  onCableChange,
}: InteractionOptions) {
  const svgRef = useRef<SVGSVGElement>(null);
  const knobGesture = useRef<KnobGesture | null>(null);
  const cableGesture = useRef<CableGesture | null>(null);
  const lastEndpointClick = useRef<EndpointClick | null>(null);
  const pickerTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colorPickerRef = useRef<SVGGElement>(null);
  const suppressClick = useRef<string | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [colorPicker, setColorPicker] = useState<CableColorPicker | null>(null);
  const [pickerPending, setPickerPending] = useState(false);
  const portById = new Map(layout.ports.map((port) => [port.id, port]));

  useEffect(
    () => () => {
      if (pickerTimeout.current) clearTimeout(pickerTimeout.current);
    },
    [],
  );

  useEffect(() => {
    if (!colorPicker && !pickerPending) return;
    function dismissPicker(event: globalThis.PointerEvent) {
      const target = event.target;
      if (target instanceof Node && colorPickerRef.current?.contains(target))
        return;
      if (
        target instanceof Element &&
        target.closest("[data-cable-endpoint]")
      )
        return;
      if (pickerTimeout.current) clearTimeout(pickerTimeout.current);
      pickerTimeout.current = null;
      lastEndpointClick.current = null;
      setPickerPending(false);
      setColorPicker(null);
    }
    document.addEventListener("pointerdown", dismissPicker);
    return () => document.removeEventListener("pointerdown", dismissPicker);
  }, [colorPicker, pickerPending]);

  function beginKnobGesture(
    event: PointerEvent<SVGElement>,
    id: string,
    value: number,
  ) {
    event.preventDefault();
    event.stopPropagation();
    knobGesture.current = {
      id,
      startY: event.clientY,
      startValue: value,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateKnobGesture(event: PointerEvent<SVGElement>) {
    const gesture = knobGesture.current;
    if (!gesture || layoutEditMode) return;
    gesture.moved ||= Math.abs(event.clientY - gesture.startY) > 2;
    const value = Math.max(
      KNOB_VALUE_MIN,
      Math.min(
        KNOB_VALUE_MAX,
        Math.round(
          gesture.startValue + (gesture.startY - event.clientY) * 0.45,
        ),
      ),
    );
    onKnobChange(gesture.id, value);
  }

  function finishKnobGesture(id: string) {
    if (!knobGesture.current) return;
    if (knobGesture.current.moved) suppressClick.current = id;
    knobGesture.current = null;
  }

  function consumeSuppressedClick(id: string): boolean {
    if (suppressClick.current !== id) return false;
    suppressClick.current = null;
    return true;
  }

  function beginCableDrag(
    event: PointerEvent<SVGElement>,
    fixedPort: PatchPort,
    originalIndex: number | null,
    color?: string,
    clickedEndpoint: PatchPort | null = null,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    if (pickerTimeout.current) {
      clearTimeout(pickerTimeout.current);
      pickerTimeout.current = null;
    }
    setPickerPending(false);
    if (
      !clickedEndpoint ||
      lastEndpointClick.current?.portId !== clickedEndpoint.id
    ) {
      lastEndpointClick.current = null;
    }
    const startPoint = eventPoint(svg, event);
    const selectedColor = normalizePatchCableColor(
      color ??
        PATCH_CABLE_COLORS[data.cables.length % PATCH_CABLE_COLORS.length]!
          .value,
    );
    cableGesture.current = {
      fixedPort,
      originalIndex,
      color: selectedColor,
      startPoint,
      clickedEndpoint,
      moved: false,
    };
    setColorPicker(null);
    setPointer(startPoint);
    svg.setPointerCapture(event.pointerId);
  }

  function beginFromPort(event: PointerEvent<SVGElement>, port: PatchPort) {
    const connectedIndex = data.cables.findIndex(
      (cable) => cable.from === port.id || cable.to === port.id,
    );
    if (connectedIndex === -1) {
      beginCableDrag(event, port, null);
      return;
    }
    const cable = data.cables[connectedIndex];
    if (!cable) return;
    const otherId = cable.from === port.id ? cable.to : cable.from;
    const otherPort = portById.get(otherId);
    if (otherPort)
      beginCableDrag(event, otherPort, connectedIndex, cable.color, port);
  }

  function beginFromCable(
    event: PointerEvent<SVGElement>,
    cable: PatchCable,
    cableIndex: number,
    start: PatchPort,
    end: PatchPort,
  ) {
    const svg = svgRef.current;
    if (!svg || layoutEditMode) return;
    const point = eventPoint(svg, event);
    const moveStart =
      Math.hypot(point.x - start.x, point.y - start.y) <
      Math.hypot(point.x - end.x, point.y - end.y);
    beginCableDrag(
      event,
      moveStart ? end : start,
      cableIndex,
      cable.color,
    );
  }

  function beginFromCableEndpoint(
    event: PointerEvent<SVGElement>,
    cable: PatchCable,
    cableIndex: number,
    port: PatchPort,
  ) {
    if (layoutEditMode) return;
    const otherPort = portById.get(cable.from === port.id ? cable.to : cable.from);
    if (otherPort)
      beginCableDrag(event, otherPort, cableIndex, cable.color, port);
  }

  function finishCableDrag(event: PointerEvent<SVGSVGElement>) {
    const gesture = cableGesture.current;
    const svg = svgRef.current;
    if (!gesture || !svg) return;
    const point = eventPoint(svg, event);
    if (
      gesture.clickedEndpoint &&
      gesture.originalIndex !== null &&
      !gesture.moved
    ) {
      const cable = data.cables[gesture.originalIndex];
      if (cable) {
        const cableKey = `${cable.from}:${cable.to}`;
        const previousClick = lastEndpointClick.current;
        if (
          previousClick?.cableKey === cableKey &&
          previousClick.portId === gesture.clickedEndpoint.id &&
          Date.now() - previousClick.time < ENDPOINT_DOUBLE_CLICK_DELAY
        ) {
          onCableChange(
            data.cables.filter((_, index) => index !== gesture.originalIndex),
          );
          setColorPicker(null);
          setPickerPending(false);
          lastEndpointClick.current = null;
        } else {
          const pickerWidth = 166;
          const pickerHeight = 38;
          const nextPicker = {
            from: cable.from,
            to: cable.to,
            x: Math.max(
              4,
              Math.min(
                layout.viewBox.width - pickerWidth - 4,
                gesture.clickedEndpoint.x + 14,
              ),
            ),
            y: Math.max(
              4,
              Math.min(
                layout.viewBox.height - pickerHeight - 4,
                gesture.clickedEndpoint.y - 22,
              ),
            ),
          };
          lastEndpointClick.current = {
            cableKey,
            portId: gesture.clickedEndpoint.id,
            time: Date.now(),
          };
          setPickerPending(true);
          pickerTimeout.current = setTimeout(() => {
            setColorPicker(nextPicker);
            setPickerPending(false);
            pickerTimeout.current = null;
          }, ENDPOINT_DOUBLE_CLICK_DELAY);
        }
      }
      cableGesture.current = null;
      setPointer(null);
      return;
    }
    if (gesture.moved) lastEndpointClick.current = null;
    const remaining =
      gesture.originalIndex === null
        ? data.cables
        : data.cables.filter((_, index) => index !== gesture.originalIndex);
    const usedPorts = new Set(
      remaining.flatMap((cable) => [cable.from, cable.to]),
    );
    const choices = layout.ports.filter(
      (port) => port.kind === (gesture.fixedPort.kind === "out" ? "in" : "out"),
    );
    const availablePorts = choices.filter((port) => !usedPorts.has(port.id));
    const target = getNearestPort(
      point,
      availablePorts,
      layout.geometry.port.connectionRadius,
    );

    if (target) {
      onCableChange([
        ...remaining,
        normalizedCable(gesture.fixedPort, target, gesture.color),
      ]);
    } else if (gesture.originalIndex !== null) {
      onCableChange(remaining);
    }
    cableGesture.current = null;
    setPointer(null);
  }

  function handleSvgPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!cableGesture.current) return;
    const nextPointer = eventPoint(event.currentTarget, event);
    cableGesture.current.moved ||=
      Math.hypot(
        nextPointer.x - cableGesture.current.startPoint.x,
        nextPointer.y - cableGesture.current.startPoint.y,
      ) > 4;
    setPointer(nextPointer);
  }

  function selectCableColor(colorPicker: CableColorPicker, color: string) {
    onCableChange(
      data.cables.map((cable) =>
        cable.from === colorPicker.from && cable.to === colorPicker.to
          ? { ...cable, color }
          : cable,
      ),
    );
    setColorPicker(null);
    setPickerPending(false);
    lastEndpointClick.current = null;
    if (pickerTimeout.current) {
      clearTimeout(pickerTimeout.current);
      pickerTimeout.current = null;
    }
  }

  const preview: CablePreview | null =
    cableGesture.current && pointer
      ? {
          path: cableCurve(cableGesture.current.fixedPort, pointer),
          color: cableGesture.current.color,
        }
      : null;
  const visibleCables = data.cables.filter(
    (_, index) => index !== cableGesture.current?.originalIndex,
  );

  return {
    svgRef,
    colorPickerRef,
    colorPicker,
    visibleCables,
    preview,
    beginKnobGesture,
    updateKnobGesture,
    finishKnobGesture,
    consumeSuppressedClick,
    beginFromPort,
    beginFromCable,
    beginFromCableEndpoint,
    handleSvgPointerMove,
    finishCableDrag,
    selectCableColor,
  };
}
