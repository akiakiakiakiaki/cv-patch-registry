import { describe, expect, it } from "vitest";
import { generateControlId, nextAutoLabel } from "@/lib/domain/control-ids";

describe("generated control IDs", () => {
  it("are prefixed by kind and unique", () => {
    const ids = Array.from({ length: 200 }, () => generateControlId("knob"));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("knob-"))).toBe(true);
  });

  it("do not contain the label, so renaming cannot change them", () => {
    expect(generateControlId("in")).not.toMatch(/In \d/);
  });
});

describe("automatic labels", () => {
  it("numbers each kind from 1", () => {
    expect(nextAutoLabel("knob", [])).toBe("Knob 1");
    expect(nextAutoLabel("in", [])).toBe("In 1");
  });

  it("fills the first free number", () => {
    expect(nextAutoLabel("knob", ["Knob 1", "Knob 3"])).toBe("Knob 2");
    expect(nextAutoLabel("switch", ["Knob 1"])).toBe("Switch 1");
  });

  it("ignores manually renamed labels of other kinds", () => {
    expect(nextAutoLabel("uni", ["Bus"])).toBe("Uni 1");
  });
});
