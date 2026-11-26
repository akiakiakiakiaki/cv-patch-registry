import { decodeImport, decodeLibrary, encodeLibrary, parseJson } from '@/lib/adapters/patch-adapter';
import { createEmptyLibrary } from '@/lib/domain/patch-library';
import { percentageToMidiValue } from '@/lib/domain/knob-range';
import type { PatchLibrary } from '@/lib/domain/types';
import type { InstrumentDefinition } from '@/lib/instruments/types';

const PROTON_STORAGE_KEY = 'proton-patch-sheet-next-v1';
const PREVIOUS_LIBRARY_KEY = 'proton-patch-library-v1';
const PREVIOUS_SINGLE_PATCH_KEY = 'proton-patch-sheet';
const MIDI_RANGE_MARKER = 'midi-127';

const SYNTH_LIBRARY_KEY = /^synth-patch-library:(.+):v1$/;

export class LocalPatchRepository {
  constructor(private readonly instrument: InstrumentDefinition) {}

  /** IDs of all instruments this browser holds a library for, including the older Proton keys. */
  static storedInstrumentIds(): string[] {
    if (typeof window === 'undefined') return [];
    const ids = new Set<string>();
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index) ?? '';
      const match = SYNTH_LIBRARY_KEY.exec(key);
      if (match?.[1]) ids.add(match[1]);
      if (key === PROTON_STORAGE_KEY || key === PREVIOUS_LIBRARY_KEY || key === PREVIOUS_SINGLE_PATCH_KEY) ids.add('behringer-proton');
    }
    return [...ids];
  }

  load(defaultPatchName = 'New patch'): PatchLibrary {
    if (typeof window === 'undefined') return createEmptyLibrary(new Date(), defaultPatchName);
    const current = this.readValue(this.storageKey());
    const decodedCurrent = decodeLibrary(current, this.instrument);
    if (decodedCurrent) return this.ensureMidiRange(decodedCurrent);

    if (this.instrument.id === 'behringer-proton') {
      const previousLibrary = decodeLibrary(this.readValue(PREVIOUS_LIBRARY_KEY), this.instrument);
      if (previousLibrary) {
        return this.ensureMidiRange(previousLibrary);
      }

      const previousPatch = this.readValue(PREVIOUS_SINGLE_PATCH_KEY);
      if (previousPatch !== null) {
        try {
          const [patch] = decodeImport(previousPatch, this.instrument).patches;
          if (patch) {
            const migrated: PatchLibrary = { activeId: patch.id, patches: [patch] };
            return this.ensureMidiRange(migrated);
          }
        } catch {
          return createEmptyLibrary(new Date(), defaultPatchName);
        }
      }
    }
    const emptyLibrary = createEmptyLibrary(new Date(), defaultPatchName);
    this.markMidiRangeCurrent();
    return emptyLibrary;
  }

  /** Whether this browser holds a library for the instrument, including the older Proton keys. */
  hasStoredLibrary(): boolean {
    if (typeof window === 'undefined') return false;
    if (decodeLibrary(this.readValue(this.storageKey()), this.instrument)) return true;
    return (
      this.instrument.id === 'behringer-proton' &&
      (window.localStorage.getItem(PREVIOUS_LIBRARY_KEY) !== null || window.localStorage.getItem(PREVIOUS_SINGLE_PATCH_KEY) !== null)
    );
  }

  /** Saves a library whose knob values already use the MIDI range, so loading it never converts them again. */
  saveCurrent(library: PatchLibrary): void {
    if (typeof window === 'undefined') return;
    this.save(library);
    this.markMidiRangeCurrent();
  }

  save(library: PatchLibrary): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(this.storageKey(), JSON.stringify(encodeLibrary(library, this.instrument.id)));
  }

  clear(): void {
    if (typeof window === 'undefined') return;
    const key = this.storageKey();
    window.localStorage.removeItem(key);
    window.localStorage.removeItem(`${key}:knob-range`);
    if (this.instrument.id === 'behringer-proton') {
      window.localStorage.removeItem(PREVIOUS_LIBRARY_KEY);
      window.localStorage.removeItem(PREVIOUS_SINGLE_PATCH_KEY);
    }
  }

  private storageKey(): string {
    return this.instrument.id === 'behringer-proton'
      ? PROTON_STORAGE_KEY
      : `synth-patch-library:${this.instrument.id}:v1`;
  }

  private ensureMidiRange(library: PatchLibrary): PatchLibrary {
    const markerKey = `${this.storageKey()}:knob-range`;
    if (window.localStorage.getItem(markerKey) === MIDI_RANGE_MARKER)
      return library;

    const migrated: PatchLibrary = {
      ...library,
      patches: library.patches.map((patch) => ({
        ...patch,
        data: {
          ...patch.data,
          knobs: Object.fromEntries(
            Object.entries(patch.data.knobs).map(([id, value]) => [
              id,
              percentageToMidiValue(value),
            ]),
          ),
        },
      })),
    };
    this.markMidiRangeCurrent();
    this.save(migrated);
    return migrated;
  }

  private markMidiRangeCurrent(): void {
    window.localStorage.setItem(
      `${this.storageKey()}:knob-range`,
      MIDI_RANGE_MARKER,
    );
  }

  private readValue(key: string): unknown | null {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? null : parseJson(raw);
    } catch {
      return null;
    }
  }
}
