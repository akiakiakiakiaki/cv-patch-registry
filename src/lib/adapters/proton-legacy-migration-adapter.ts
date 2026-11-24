import type { ControlKind } from "@/lib/domain/control-ids";
import { categoryStateKey } from "@/lib/domain/switch-categories";
import type { PatchCable, PatchData, PatchLibrary } from "@/lib/domain/types";
import { decodeImport, type DecodedImport } from "@/lib/adapters/patch-adapter";
import { encodeInstrumentLayout } from "@/lib/adapters/instrument-layout-adapter";
import type { ControlCategory, InstrumentLayout, KnobDefinition, LedDefinition, PatchPort, SwitchDefinition } from "@/lib/instrument/layout";
import { normalizePixelPosition } from "@/lib/instrument/pixel-position";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";

/**
 * One-way migration from the built-in (legacy) Behringer Proton to its editable clone.
 * The clone is an ordinary synth: editor-style control IDs, Shift as a selector switch, a regular panel asset.
 * Everything here is a pure mapping, usable on the server (clone script) and in the browser
 * (guest libraries, imports of legacy exports). Remove it together with the legacy Proton.
 */

export const LEGACY_PROTON_SLUG = behringerProton.id;
export const PROTON_CLONE_SLUG = "behringer-proton-v2";
export const PROTON_CLONE_NAME = "Behringer Proton";
export const PROTON_CLONE_MANUFACTURER = "Behringer";

/** The clone's panel: proton.png scaled to 2048 px wide, so the shared control sizes fit as before. */
export const PROTON_CLONE_PANEL = { width: 2048, height: 653 } as const;

/** Artboard of proton.svg, which the legacy layout was aligned to. */
const LEGACY_ARTWORK = { width: 3807.29, height: 1214 } as const;

export const CLONE_NORMAL_CATEGORY: ControlCategory = { id: "cat-00000001", name: "Normal", color: "#f0443e" };
export const CLONE_SHIFT_CATEGORY: ControlCategory = { id: "cat-00000002", name: "Shift", color: "#82d8ff" };

const LEGACY_SHIFT_ID = "Shift";
const LEGACY_BLUE_SUFFIX = "::blue";
/** Switches with a red and a blue state in the legacy adapter; they become dependents of Shift. */
const LEGACY_DUAL_CHANNEL_IDS = new Set(["1 shot", "Sync LFO", "Retrig LFO", "Loop", "Bounce", "Sustain", "Invert", "Reverse", "Retrig ASR"]);

/** FNV-1a, 32 bit, as 8 hex digits: deterministic and synchronous in every runtime. */
function hash8(value: string): string {
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Editor-style ID for a legacy control, the same on every call: `Tune 1` (knob) always becomes the same `knob-…`. */
export function cloneControlId(kind: ControlKind, legacyId: string): string {
  return `${kind}-${hash8(`${kind}:${legacyId}`)}`;
}

const legacy = behringerProton.layout;
const knobIds = new Map(legacy.knobs.map((knob) => [knob.id, cloneControlId("knob", knob.id)]));
const switchIds = new Map(legacy.switches.map((control) => [control.id, cloneControlId("switch", control.id)]));
const ledIds = new Map(legacy.leds.map((led) => [led.id, cloneControlId("led", led.id)]));
const portIds = new Map(legacy.ports.map((port) => [port.id, cloneControlId(port.kind, port.id)]));
const cloneShiftId = switchIds.get(LEGACY_SHIFT_ID)!;

/**
 * The legacy panel draws proton.svg centered inside a box with the layout's aspect ratio, leaving a thin
 * margin left and right. This maps a legacy position onto the artwork and then onto the clone's panel.
 */
export function clonePosition(point: { x: number; y: number }): { x: number; y: number } {
  const artworkWidthInLayout = legacy.viewBox.height * (LEGACY_ARTWORK.width / LEGACY_ARTWORK.height);
  const margin = (legacy.viewBox.width - artworkWidthInLayout) / 2;
  const u = (point.x - margin) / artworkWidthInLayout;
  const v = point.y / legacy.viewBox.height;
  return {
    x: normalizePixelPosition(u * PROTON_CLONE_PANEL.width, PROTON_CLONE_PANEL.width),
    y: normalizePixelPosition(v * PROTON_CLONE_PANEL.height, PROTON_CLONE_PANEL.height),
  };
}

/** The clone's first layout, built from the legacy one. Labels keep the legacy names. */
export function buildProtonCloneLayout(): InstrumentLayout {
  const knobs: KnobDefinition[] = legacy.knobs.map((knob) => ({
    id: knobIds.get(knob.id)!,
    label: knob.label ?? knob.id,
    ...clonePosition(knob),
  }));
  const switches: SwitchDefinition[] = legacy.switches.map((control) => ({
    id: switchIds.get(control.id)!,
    label: control.label ?? control.id,
    ...clonePosition(control),
    ...(control.id === LEGACY_SHIFT_ID ? { selects: [CLONE_NORMAL_CATEGORY.id, CLONE_SHIFT_CATEGORY.id] } : {}),
    ...(LEGACY_DUAL_CHANNEL_IDS.has(control.id) ? { dependsOn: cloneShiftId } : {}),
  }));
  const leds: LedDefinition[] = legacy.leds.map((led) => ({
    id: ledIds.get(led.id)!,
    label: led.label ?? led.id,
    color: led.color,
    ...clonePosition(led),
  }));
  const ports: PatchPort[] = legacy.ports.map((port) => ({
    id: portIds.get(port.id)!,
    label: port.label,
    kind: port.kind,
    ...clonePosition(port),
  }));
  return encodeInstrumentLayout({
    schemaVersion: 1,
    layoutVersion: 1,
    id: PROTON_CLONE_SLUG,
    displayName: PROTON_CLONE_NAME,
    viewBox: { ...PROTON_CLONE_PANEL },
    geometry: legacy.geometry,
    knobStartAngle: legacy.knobStartAngle,
    knobSweepAngle: legacy.knobSweepAngle,
    categories: [CLONE_NORMAL_CATEGORY, CLONE_SHIFT_CATEGORY],
    knobs,
    switches,
    leds,
    ports,
  });
}

/** Maps a legacy switch state key; null for keys the clone has no state for. */
function cloneSwitchKey(key: string): string | null {
  if (key === `${LEGACY_SHIFT_ID}${LEGACY_BLUE_SUFFIX}`) return categoryStateKey(cloneShiftId, CLONE_SHIFT_CATEGORY.id);
  const blue = key.endsWith(LEGACY_BLUE_SUFFIX);
  const legacyId = blue ? key.slice(0, -LEGACY_BLUE_SUFFIX.length) : key;
  const id = switchIds.get(legacyId);
  if (!id || legacyId === LEGACY_SHIFT_ID) return null;
  if (LEGACY_DUAL_CHANNEL_IDS.has(legacyId)) {
    return categoryStateKey(id, blue ? CLONE_SHIFT_CATEGORY.id : CLONE_NORMAL_CATEGORY.id);
  }
  return blue ? null : id;
}

function mapKeys<T>(values: Readonly<Record<string, T>>, mapKey: (key: string) => string | null | undefined): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(values)) {
    const mapped = mapKey(key);
    if (mapped) result[mapped] = value;
  }
  return result;
}

/**
 * A legacy patch's settings for the clone: same values, new IDs. Red and blue states of the dual-channel
 * switches move to the Normal and Shift categories; the selected channel becomes Shift's active category.
 * Values for unknown controls are dropped.
 */
export function migrateLegacyPatchData(data: PatchData): PatchData {
  const cables: PatchCable[] = data.cables.flatMap((cable) => {
    const from = portIds.get(cable.from);
    const to = portIds.get(cable.to);
    return from && to ? [{ ...cable, from, to }] : [];
  });
  return {
    knobs: mapKeys(data.knobs, (key) => knobIds.get(key)),
    switches: mapKeys(data.switches, cloneSwitchKey),
    leds: mapKeys(data.leds, (key) => ledIds.get(key)),
    cables,
  };
}

/** A legacy library with every patch migrated; IDs, names, timestamps and the active patch stay. */
export function migrateLegacyLibrary(library: PatchLibrary): PatchLibrary {
  return { ...library, patches: library.patches.map((patch) => ({ ...patch, data: migrateLegacyPatchData(patch.data) })) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Exports of the legacy Proton: current exports with its instrument ID, and the older Proton formats. */
export function isLegacyProtonExport(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.format === "synth-patch-library") return value.instrumentId === LEGACY_PROTON_SLUG;
  return value.format === "proton-patch-library" || value.format === undefined;
}

/**
 * Reads a legacy Proton export for the clone. Patch IDs are not kept: the clone's patches were copied
 * under new IDs, so the import matches them by name instead (like older exports without stable IDs).
 */
export function decodeLegacyProtonExportForClone(value: unknown): DecodedImport {
  const decoded = decodeImport(value, behringerProton);
  return { hasStableIds: false, patches: decoded.patches.map((patch) => ({ ...patch, data: migrateLegacyPatchData(patch.data) })) };
}

