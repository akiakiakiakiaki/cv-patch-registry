import { describe, expect, it } from "vitest";
import { diffPatchLibraries } from "@/lib/patches/library-diff";
import type { PatchLibrary, PatchRecord } from "@/lib/domain/types";

const patch = (id: string, name = id, knob = 0): PatchRecord => ({
  id,
  name,
  updatedAt: "2026-01-01T00:00:00.000Z",
  data: { knobs: { k: knob }, switches: {}, leds: {}, cables: [] },
});
const library = (...patches: PatchRecord[]): PatchLibrary => ({ activeId: patches[0]?.id ?? "", patches });

describe("diffPatchLibraries", () => {
  it("reports every patch as created when there was no previous library", () => {
    expect(diffPatchLibraries(null, library(patch("a"))).created.map((item) => item.id)).toEqual(["a"]);
  });

  it("detects created, deleted and changed patches", () => {
    const before = library(patch("a"), patch("b"));
    const after = library(patch("a", "renamed"), patch("c"));
    expect(diffPatchLibraries(before, after)).toEqual({
      created: [expect.objectContaining({ id: "c" })],
      deleted: ["b"],
      changed: ["a"],
    });
  });

  it("treats changes of knob values as changes", () => {
    expect(diffPatchLibraries(library(patch("a", "a", 1)), library(patch("a", "a", 2))).changed).toEqual(["a"]);
  });

  it("ignores switching the active patch", () => {
    const before = library(patch("a"), patch("b"));
    const after = { ...before, activeId: "b" };
    expect(diffPatchLibraries(before, after)).toEqual({ created: [], deleted: [], changed: [] });
  });
});
