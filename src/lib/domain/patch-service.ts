import { createId } from "@/lib/domain/ids";
import { normalizeKnobValue } from "@/lib/domain/knob-range";
import type {
  ImportChoices,
  PatchData,
  PatchLibrary,
  PatchRecord,
} from "@/lib/domain/types";

export function createEmptyPatch(
  name = "Neues Patch",
  now = new Date(),
): PatchRecord {
  return {
    id: createId(),
    name,
    updatedAt: now.toISOString(),
    data: { knobs: {}, switches: {}, leds: {}, cables: [] },
  };
}

export function createEmptyLibrary(
  now = new Date(),
  firstPatchName = "Neues Patch",
): PatchLibrary {
  const firstPatch = createEmptyPatch(firstPatchName, now);
  return { activeId: firstPatch.id, patches: [firstPatch] };
}

export function updatePatch(
  library: PatchLibrary,
  patchId: string,
  changes: Partial<Pick<PatchRecord, "name" | "data">>,
  now = new Date(),
): PatchLibrary {
  return {
    ...library,
    patches: library.patches.map((patch) =>
      patch.id === patchId
        ? { ...patch, ...changes, updatedAt: now.toISOString() }
        : patch,
    ),
  };
}

export function updateKnob(
  library: PatchLibrary,
  patchId: string,
  knobId: string,
  value: number,
  now = new Date(),
): PatchLibrary {
  const patch = library.patches.find((item) => item.id === patchId);
  if (!patch) return library;
  const normalizedValue = normalizeKnobValue(value);
  return updatePatch(
    library,
    patchId,
    {
      data: {
        ...patch.data,
        knobs: { ...patch.data.knobs, [knobId]: normalizedValue },
      },
    },
    now,
  );
}

export function updateSwitch(
  library: PatchLibrary,
  patchId: string,
  switchId: string,
  value: boolean,
  now = new Date(),
): PatchLibrary {
  const patch = library.patches.find((item) => item.id === patchId);
  if (!patch) return library;
  return updatePatch(
    library,
    patchId,
    {
      data: {
        ...patch.data,
        switches: { ...patch.data.switches, [switchId]: value },
      },
    },
    now,
  );
}

export function updateLed(
  library: PatchLibrary,
  patchId: string,
  ledId: string,
  value: boolean,
  now = new Date(),
): PatchLibrary {
  const patch = library.patches.find((item) => item.id === patchId);
  if (!patch) return library;
  return updatePatch(
    library,
    patchId,
    { data: { ...patch.data, leds: { ...patch.data.leds, [ledId]: value } } },
    now,
  );
}

export function updateCables(
  library: PatchLibrary,
  patchId: string,
  cables: PatchData["cables"],
  now = new Date(),
): PatchLibrary {
  const patch = library.patches.find((item) => item.id === patchId);
  if (!patch) return library;
  return updatePatch(
    library,
    patchId,
    { data: { ...patch.data, cables } },
    now,
  );
}

export function addPatch(
  library: PatchLibrary,
  now = new Date(),
  name = `Neues Patch ${library.patches.length + 1}`,
): PatchLibrary {
  const patch = createEmptyPatch(name, now);
  return { activeId: patch.id, patches: [...library.patches, patch] };
}

export function activatePatch(
  library: PatchLibrary,
  patchId: string,
): PatchLibrary {
  return library.patches.some((patch) => patch.id === patchId)
    ? { ...library, activeId: patchId }
    : library;
}

export function removePatch(
  library: PatchLibrary,
  patchId: string,
  now = new Date(),
  firstPatchName = "Neues Patch",
): PatchLibrary {
  const patches = library.patches.filter((patch) => patch.id !== patchId);
  if (patches.length === 0) return createEmptyLibrary(now, firstPatchName);
  const activeId =
    library.activeId === patchId ? patches[0]!.id : library.activeId;
  return { activeId, patches };
}

export function patchContentDiffers(
  left: PatchRecord,
  right: PatchRecord,
): boolean {
  return (
    JSON.stringify({ name: left.name, data: left.data }) !==
    JSON.stringify({ name: right.name, data: right.data })
  );
}

export function mergePatchLibrary(
  local: PatchLibrary,
  incoming: readonly PatchRecord[],
  choices: ImportChoices,
): PatchLibrary {
  const patches = [...local.patches];
  for (const importedPatch of incoming) {
    const index = patches.findIndex((patch) => patch.id === importedPatch.id);
    if (index < 0) {
      patches.push(importedPatch);
      continue;
    }
    const localPatch = patches[index]!;
    if (!patchContentDiffers(localPatch, importedPatch)) {
      if (
        Date.parse(importedPatch.updatedAt) > Date.parse(localPatch.updatedAt)
      )
        patches[index] = importedPatch;
      continue;
    }
    if (choices[importedPatch.id] === "incoming")
      patches[index] = importedPatch;
  }
  return { ...local, patches };
}

export function replacePatchData(
  patch: PatchRecord,
  data: PatchData,
  now = new Date(),
): PatchRecord {
  return { ...patch, data, updatedAt: now.toISOString() };
}
