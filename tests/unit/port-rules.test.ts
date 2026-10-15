import { describe, expect, it } from "vitest";
import { canConnect, normalizeCableEndpoints, type PortKind } from "@/lib/domain/port-rules";

const KINDS: PortKind[] = ["in", "out", "uni"];

describe("canConnect", () => {
  const expected: Record<string, boolean> = {
    "in-in": false,
    "in-out": true,
    "in-uni": true,
    "out-in": true,
    "out-out": false,
    "out-uni": true,
    "uni-in": true,
    "uni-out": true,
    "uni-uni": true,
  };

  for (const a of KINDS) {
    for (const b of KINDS) {
      it(`${a} ↔ ${b} is ${expected[`${a}-${b}`] ? "allowed" : "rejected"}`, () => {
        expect(canConnect({ kind: a }, { kind: b })).toBe(expected[`${a}-${b}`]);
      });
    }
  }
});

describe("normalizeCableEndpoints", () => {
  const out = { id: "o", kind: "out" as const };
  const input = { id: "i", kind: "in" as const };
  const uni = { id: "u", kind: "uni" as const };
  const uni2 = { id: "u2", kind: "uni" as const };

  it("stores plain in/out pairs as out → in, whatever the drag direction", () => {
    expect(normalizeCableEndpoints(input, out)).toEqual({ from: "o", to: "i" });
    expect(normalizeCableEndpoints(out, input)).toEqual({ from: "o", to: "i" });
  });

  it("keeps the drag direction for cables that involve a uni port", () => {
    expect(normalizeCableEndpoints(uni, input)).toEqual({ from: "u", to: "i" });
    expect(normalizeCableEndpoints(input, uni)).toEqual({ from: "i", to: "u" });
    expect(normalizeCableEndpoints(uni2, uni)).toEqual({ from: "u2", to: "u" });
  });
});
