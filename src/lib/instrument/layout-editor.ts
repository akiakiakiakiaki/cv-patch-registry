import type { FocusedLayoutElement, InstrumentLayout, LayoutElementKind } from '@/lib/instrument/layout';
import { normalizePixelPosition } from '@/lib/instrument/pixel-position';

export function moveLayoutElement(
  layout: InstrumentLayout,
  target: FocusedLayoutElement,
  delta: { x: number; y: number }
): InstrumentLayout {
  const listByKind: Record<LayoutElementKind, 'knobs' | 'switches' | 'leds' | 'ports'> = {
    knob: 'knobs',
    switch: 'switches',
    led: 'leds',
    port: 'ports'
  };
  const listName = listByKind[target.kind];
  const points = layout[listName];
  const point = points.find((item) => item.id === target.id);
  if (!point) return layout;

  const moved = {
    ...point,
    x: normalizePixelPosition(point.x + delta.x, layout.viewBox.width),
    y: normalizePixelPosition(point.y + delta.y, layout.viewBox.height)
  };
  return { ...layout, [listName]: points.map((item) => item.id === target.id ? moved : item) };
}

export function layoutElementPosition(layout: InstrumentLayout, target: FocusedLayoutElement) {
  const listName = {
    knob: 'knobs',
    switch: 'switches',
    led: 'leds',
    port: 'ports'
  } as const;
  return layout[listName[target.kind]].find((item) => item.id === target.id);
}
