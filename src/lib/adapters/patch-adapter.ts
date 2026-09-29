import { createId } from "@/lib/domain/ids";
import { PATCH_LIBRARY_SCHEMA_VERSION } from "@/lib/domain/types";
import type {
  PatchCable,
  PatchData,
  PatchLibrary,
  PatchLibraryExport,
  PatchRecord,
} from "@/lib/domain/types";
import type { InstrumentDefinition } from "@/lib/instruments/types";
import { normalizePatchCableColor } from "@/lib/domain/patch-colors";
import { normalizeKnobValue } from "@/lib/domain/knob-range";

type UnknownRecord = Record<string, unknown>;

export interface DecodedImport {
  patches: PatchRecord[];
  hasStableIds: boolean;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBooleanMap(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
    ),
  );
}

function readKnobMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === "number" && Number.isFinite(entry[1]),
      )
      .map(([id, number]) => [id, normalizeKnobValue(number)]),
  );
}

export function normalizePatchData(
  value: unknown,
  instrument: InstrumentDefinition,
): PatchData {
  const raw = isRecord(value) ? value : {};
  const usedPorts = new Set<string>();
  const ports = instrument.layout.ports;
  const validPortIds = new Set(ports.map((port) => port.id));
  const rawCables = Array.isArray(raw.cables) ? raw.cables : [];
  const cables = rawCables.flatMap((entry): PatchCable[] => {
    if (
      !isRecord(entry) ||
      typeof entry.from !== "string" ||
      typeof entry.to !== "string"
    )
      return [];
    if (
      !validPortIds.has(entry.from) ||
      !validPortIds.has(entry.to) ||
      usedPorts.has(entry.from) ||
      usedPorts.has(entry.to)
    )
      return [];
    const from = ports.find((port) => port.id === entry.from);
    const to = ports.find((port) => port.id === entry.to);
    if (!from || !to || from.kind === to.kind) return [];
    usedPorts.add(entry.from);
    usedPorts.add(entry.to);
    const color = normalizePatchCableColor(entry.color);
    return [
      {
        from: from.kind === "out" ? from.id : to.id,
        to: from.kind === "in" ? from.id : to.id,
        color,
      },
    ];
  });

  return {
    knobs: readKnobMap(raw.knobs),
    switches: readBooleanMap(raw.switches),
    leds: readBooleanMap(raw.leds ?? raw.circles),
    cables,
  };
}

function normalizePatch(
  value: unknown,
  index: number,
  defaultTimestamp: string,
  instrument: InstrumentDefinition,
): PatchRecord | null {
  if (!isRecord(value)) return null;
  const data = isRecord(value.data) ? value.data : value;
  const name =
    typeof value.name === "string" && value.name.trim()
      ? value.name.trim()
      : `Importiertes Patch ${index + 1}`;
  const id = typeof value.id === "string" && value.id ? value.id : createId();
  const updatedAt =
    typeof value.updatedAt === "string" &&
    !Number.isNaN(Date.parse(value.updatedAt))
      ? value.updatedAt
      : defaultTimestamp;
  return { id, name, updatedAt, data: normalizePatchData(data, instrument) };
}

export function decodeLibrary(
  value: unknown,
  instrument: InstrumentDefinition,
): PatchLibrary | null {
  if (!isRecord(value) || !Array.isArray(value.patches)) return null;
  if (value.format === "synth-patch-library") {
    if (
      value.schemaVersion !== PATCH_LIBRARY_SCHEMA_VERSION ||
      value.instrumentId !== instrument.id
    )
      return null;
  } else if (
    (value.format !== undefined && value.format !== "proton-patch-library") ||
    instrument.id !== "behringer-proton"
  ) {
    return null;
  } else if (
    value.schemaVersion !== undefined &&
    value.schemaVersion !== PATCH_LIBRARY_SCHEMA_VERSION
  ) {
    return null;
  }
  const patches = value.patches.flatMap((patch, index): PatchRecord[] => {
    const normalized = normalizePatch(
      patch,
      index,
      new Date().toISOString(),
      instrument,
    );
    return normalized ? [normalized] : [];
  });
  if (patches.length === 0) return null;
  const savedActiveId =
    typeof value.activeId === "string" ? value.activeId : "";
  return {
    activeId: patches.some((patch) => patch.id === savedActiveId)
      ? savedActiveId
      : patches[0]!.id,
    patches,
  };
}

export function decodeImport(
  value: unknown,
  instrument: InstrumentDefinition,
): DecodedImport {
  if (!isRecord(value)) throw new Error("status.importErrorObject");
  if (value.format === "synth-patch-library") {
    if (value.schemaVersion !== PATCH_LIBRARY_SCHEMA_VERSION)
      throw new Error("status.importUnsupportedVersion");
    if (value.instrumentId !== instrument.id)
      throw new Error("status.importWrongInstrument");
  } else if (value.format === "proton-patch-library") {
    if (instrument.id !== "behringer-proton")
      throw new Error("status.importWrongInstrument");
    if (
      value.schemaVersion !== undefined &&
      value.schemaVersion !== PATCH_LIBRARY_SCHEMA_VERSION
    )
      throw new Error("status.importUnsupportedVersion");
  } else if (
    value.format !== undefined &&
    value.format !== "proton-patch-library"
  ) {
    throw new Error("status.importUnknownFormat");
  } else if (instrument.id !== "behringer-proton") {
    throw new Error("status.importWrongInstrument");
  }
  const fallbackTimestamp =
    typeof value.exportedAt === "string"
      ? value.exportedAt
      : new Date().toISOString();
  if (Array.isArray(value.patches)) {
    const patches = value.patches.flatMap((patch, index): PatchRecord[] => {
      const normalized = normalizePatch(
        patch,
        index,
        fallbackTimestamp,
        instrument,
      );
      return normalized ? [normalized] : [];
    });
    if (patches.length === 0) throw new Error("status.importErrorPatches");
    const hasStableIds = value.patches.every(
      (patch) =>
        isRecord(patch) && typeof patch.id === "string" && patch.id.length > 0,
    );
    return { patches, hasStableIds };
  }
  const legacyPatch = normalizePatch(value, 0, fallbackTimestamp, instrument);
  if (!legacyPatch) throw new Error("status.importErrorPatch");
  return {
    patches: [legacyPatch],
    hasStableIds: typeof value.id === "string" && value.id.length > 0,
  };
}

export function associateLegacyPatches(
  imported: readonly PatchRecord[],
  local: readonly PatchRecord[],
): PatchRecord[] {
  return imported.map((patch) => {
    const match = local.find((candidate) => candidate.name === patch.name);
    return match ? { ...patch, id: match.id } : patch;
  });
}

export function encodeLibrary(
  library: PatchLibrary,
  instrumentId: string,
  exportedAt = new Date().toISOString(),
): PatchLibraryExport {
  return {
    format: "synth-patch-library",
    schemaVersion: PATCH_LIBRARY_SCHEMA_VERSION,
    instrumentId,
    exportedAt,
    activeId: library.activeId,
    patches: library.patches,
  };
}

export function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}
