import {
  associateLegacyPatches,
  decodeImport,
  encodeLibrary,
  parseJson,
  requiredPatchSchemaMinor,
} from "@/lib/adapters/patch-adapter";
import { PROTON_CLONE_SLUG, decodeLegacyProtonExportForClone, isLegacyProtonExport } from "@/lib/adapters/proton-legacy-migration-adapter";
import { mergePatchLibrary, patchContentDiffers } from "@/lib/domain/patch-library";
import type { PatchLibrary, PatchRecord } from "@/lib/domain/types";
import type { InstrumentDefinition } from "@/lib/instruments/types";
import { isMessageKey, type MessageKey } from "@/i18n/messages";

/** Export file of a synth's library: name and JSON contents. */
export function libraryExport(library: PatchLibrary, instrument: InstrumentDefinition, exportedAt: string): { filename: string; contents: string } {
  const bundle = encodeLibrary(library, instrument.id, exportedAt, requiredPatchSchemaMinor(library, instrument));
  return {
    filename: `${instrument.id}-patches-${exportedAt.replace(/[:.]/g, "-")}.json`,
    contents: JSON.stringify(bundle, null, 2),
  };
}

/** Lets the browser save `contents` as a JSON file. */
export function downloadJson(filename: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** A patch that exists here and in the file with different contents. */
export interface ImportConflict {
  local: PatchRecord;
  incoming: PatchRecord;
}

export interface ImportResult {
  library: PatchLibrary;
  added: number;
  updated: number;
}

/**
 * Merges an export file into `library`. For each conflicting patch, `useIncoming` decides which version stays.
 * Throws on unreadable files (see importErrorMessage).
 */
export async function importLibraryFile(
  file: File,
  library: PatchLibrary,
  instrument: InstrumentDefinition,
  useIncoming: (conflict: ImportConflict) => Promise<boolean>,
): Promise<ImportResult> {
  const decoded = parseJson(await file.text());
  // A legacy Proton export is migrated when imported into the editable clone.
  const imported =
    instrument.id === PROTON_CLONE_SLUG && isLegacyProtonExport(decoded)
      ? decodeLegacyProtonExportForClone(decoded)
      : decodeImport(decoded, instrument);
  const incoming = imported.hasStableIds ? imported.patches : associateLegacyPatches(imported.patches, library.patches);
  const choices: Record<string, "local" | "incoming"> = {};
  for (const incomingPatch of incoming) {
    const local = library.patches.find((candidate) => candidate.id === incomingPatch.id);
    if (!local || !patchContentDiffers(local, incomingPatch)) continue;
    choices[incomingPatch.id] = (await useIncoming({ local, incoming: incomingPatch })) ? "incoming" : "local";
  }
  const merged = mergePatchLibrary(library, incoming, choices);
  return {
    library: merged,
    added: merged.patches.length - library.patches.length,
    updated: incoming.filter((item) => choices[item.id] === "incoming").length,
  };
}

/** Why an import failed, as a message key or the error's own text. */
export function importErrorMessage(error: unknown): { key: MessageKey } | { text: string } {
  if (error instanceof SyntaxError) return { key: "status.importErrorJson" };
  if (error instanceof Error) return isMessageKey(error.message) ? { key: error.message } : { text: error.message };
  return { key: "status.unknownError" };
}
