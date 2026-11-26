import { describe, expect, it, vi } from "vitest";
import { importErrorMessage, importLibraryFile, libraryExport } from "@/components/patch-sheet/patch-file";
import { EMPTY_PATCH_DATA } from "@/lib/domain/patch-library";
import type { PatchLibrary, PatchRecord } from "@/lib/domain/types";
import { testInstrument } from "../fixtures/instrument";

const patch = (id: string, name: string, updatedAt: string): PatchRecord => ({ id, name, updatedAt, data: structuredClone(EMPTY_PATCH_DATA) });

describe("patch file export", () => {
  it("names the file after the synth and the export time, and stores the library", () => {
    const library: PatchLibrary = { activeId: "a", patches: [patch("a", "Bass", "2026-01-01T00:00:00.000Z")] };
    const file = libraryExport(library, testInstrument, "2026-11-26T10:20:30.400Z");
    expect(file.filename).toBe(`${testInstrument.id}-patches-2026-11-26T10-20-30-400Z.json`);
    expect(JSON.parse(file.contents)).toMatchObject({ format: "synth-patch-library", instrumentId: testInstrument.id, activeId: "a" });
  });
});

describe("patch file import", () => {
  const local: PatchLibrary = { activeId: "a", patches: [patch("a", "Bass", "2026-01-02T00:00:00.000Z")] };
  const exported = (patches: PatchRecord[]) =>
    new File([libraryExport({ activeId: patches[0]!.id, patches }, testInstrument, "2026-11-26T00:00:00.000Z").contents], "x.json");

  it("adds new patches and asks only about patches whose contents differ", async () => {
    const ask = vi.fn().mockResolvedValue(true);
    const changed = { ...patch("a", "Bass v2", "2026-01-03T00:00:00.000Z") };
    const result = await importLibraryFile(exported([changed, patch("b", "Lead", "2026-01-01T00:00:00.000Z")]), local, testInstrument, ask);
    expect(ask).toHaveBeenCalledOnce();
    expect(ask.mock.calls[0]![0]).toMatchObject({ local: { name: "Bass" }, incoming: { name: "Bass v2" } });
    expect(result.added).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.library.patches.find((item) => item.id === "a")?.name).toBe("Bass v2");
  });

  it("keeps the local version when the user says so", async () => {
    const result = await importLibraryFile(exported([patch("a", "Bass v2", "2026-01-03T00:00:00.000Z")]), local, testInstrument, async () => false);
    expect(result.updated).toBe(0);
    expect(result.library.patches.find((item) => item.id === "a")?.name).toBe("Bass");
  });

  it("explains why a file could not be imported", async () => {
    const broken = new File(["{"], "x.json");
    const error = await importLibraryFile(broken, local, testInstrument, async () => true).catch((caught: unknown) => caught);
    expect(importErrorMessage(error)).toEqual({ key: "status.importErrorJson" });
    expect(importErrorMessage(new Error("Something odd"))).toEqual({ text: "Something odd" });
    expect(importErrorMessage("nope")).toEqual({ key: "status.unknownError" });
  });
});
