import type { PatchCableColorId } from "@/lib/domain/patch-colors";

export interface PatchCable {
  from: string;
  to: string;
  colorId: PatchCableColorId;
}

export interface PatchData {
  knobs: Record<string, number>;
  switches: Record<string, boolean>;
  leds: Record<string, boolean>;
  cables: PatchCable[];
}

export interface PatchRecord {
  id: string;
  name: string;
  updatedAt: string;
  data: PatchData;
}

export interface PatchLibrary {
  activeId: string;
  patches: PatchRecord[];
}

export const PATCH_LIBRARY_SCHEMA_VERSION = 1 as const;
/** Highest patch-library minor this app can read. Minor 1 allows cables to uni ports. */
export const PATCH_LIBRARY_SCHEMA_MINOR = 1 as const;

export interface PatchLibraryExport {
  format: 'synth-patch-library';
  schemaVersion: 1;
  schemaMinor?: number;
  instrumentId: string;
  exportedAt: string;
  activeId: string;
  patches: PatchRecord[];
}

export type ImportChoice = 'local' | 'incoming';
export type ImportChoices = Readonly<Record<string, ImportChoice>>;
