import { beforeEach, describe, expect, it } from "vitest";
import { LocalPatchRepository } from "@/lib/storage/local-patch-repository";
import { createEmptyLibrary } from "@/lib/domain/patch-service";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";

const PROTON_KEY = "proton-patch-sheet-next-v1";

describe("local patch repository", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips the versioned library under the existing Proton key", () => {
    const repository = new LocalPatchRepository(behringerProton);
    const library = createEmptyLibrary(new Date("2026-01-01T00:00:00.000Z"), "Init");

    repository.save(library);

    const stored = JSON.parse(window.localStorage.getItem(PROTON_KEY) ?? "null") as {
      format: string;
      schemaVersion: number;
      instrumentId: string;
    };
    expect(stored).toMatchObject({
      format: "synth-patch-library",
      schemaVersion: 1,
      instrumentId: behringerProton.id,
    });
    expect(repository.load()).toEqual(library);
  });

  it("migrates a legacy Proton patch library and preserves stable patch IDs", () => {
    window.localStorage.setItem(
      "proton-patch-library-v1",
      JSON.stringify({
        format: "proton-patch-library",
        activeId: "legacy-id",
        patches: [
          {
            id: "legacy-id",
            name: "Old patch",
            updatedAt: "2025-01-01T00:00:00.000Z",
            data: { knobs: { Freq: 25 } },
          },
        ],
      }),
    );

    const library = new LocalPatchRepository(behringerProton).load();

    expect(library.activeId).toBe("legacy-id");
    expect(library.patches[0]).toMatchObject({
      id: "legacy-id",
      name: "Old patch",
      data: { knobs: { Freq: 32 } },
    });
    expect(window.localStorage.getItem(PROTON_KEY)).not.toBeNull();
  });

  it("converts existing percentage-based local knob values to MIDI values once", () => {
    window.localStorage.setItem(
      PROTON_KEY,
      JSON.stringify({
        format: "synth-patch-library",
        schemaVersion: 1,
        instrumentId: behringerProton.id,
        exportedAt: "2026-01-01T00:00:00.000Z",
        activeId: "old-scale",
        patches: [
          {
            id: "old-scale",
            name: "Old scale",
            updatedAt: "2026-01-01T00:00:00.000Z",
            data: { knobs: { minimum: 0, midpoint: 50, maximum: 100 } },
          },
        ],
      }),
    );

    const repository = new LocalPatchRepository(behringerProton);
    const firstLoad = repository.load();
    expect(firstLoad.patches[0]?.data.knobs).toEqual({
      minimum: 0,
      midpoint: 64,
      maximum: 127,
    });
    expect(repository.load().patches[0]?.data.knobs).toEqual(
      firstLoad.patches[0]?.data.knobs,
    );
    expect(window.localStorage.getItem(`${PROTON_KEY}:knob-range`)).toBe("midi-127");
  });

  it("uses a separate storage key for each additional synth", () => {
    const secondInstrument = {
      ...behringerProton,
      id: "test-synth",
      displayName: "Test Synth",
      layout: {
        ...behringerProton.layout,
        id: "test-synth",
        displayName: "Test Synth",
      },
    };
    const secondRepository = new LocalPatchRepository(secondInstrument);
    const library = createEmptyLibrary(new Date(), "Other synth patch");

    secondRepository.save(library);

    expect(window.localStorage.getItem("synth-patch-library:test-synth:v1")).not.toBeNull();
    expect(window.localStorage.getItem(PROTON_KEY)).toBeNull();
    expect(secondRepository.load()).toEqual(library);
  });

  it("returns a fresh library when stored JSON is corrupt", () => {
    window.localStorage.setItem(PROTON_KEY, "not-json");
    const library = new LocalPatchRepository(behringerProton).load("Fresh");
    expect(library.patches).toHaveLength(1);
    expect(library.patches[0]?.name).toBe("Fresh");
    expect(library.activeId).toBe(library.patches[0]?.id);
  });
});
