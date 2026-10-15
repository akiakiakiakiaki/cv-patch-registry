import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import protonLayoutJson from "@/lib/instrument/behringer-proton/behringer-proton-layout.json";
import { decodeInstrumentLayout, encodeInstrumentLayout } from "@/lib/adapters/instrument-layout-adapter";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import { readSchemaMinor } from "@/lib/domain/schema-version";
import type { InstrumentLayout } from "@/lib/instrument/layout";

const reference = behringerProton.layout;
const protonFile = readFileSync(
  path.join(process.cwd(), "src/lib/instrument/behringer-proton/behringer-proton-layout.json"),
  "utf8",
);

function withUniPort(layout: InstrumentLayout): InstrumentLayout {
  return {
    ...layout,
    ports: [...layout.ports, { id: "uni-1", label: "Uni 1", kind: "uni", x: 1000, y: 600 }],
  };
}

describe("schemaMinor reader", () => {
  it("treats a missing minor as 0", () => {
    expect(readSchemaMinor(undefined, 1)).toBe(0);
  });

  it("accepts minors up to the supported one", () => {
    expect(readSchemaMinor(0, 1)).toBe(0);
    expect(readSchemaMinor(1, 1)).toBe(1);
  });

  it("rejects newer minors, negative, fractional and non-numeric values", () => {
    expect(readSchemaMinor(2, 1)).toBeNull();
    expect(readSchemaMinor(-1, 1)).toBeNull();
    expect(readSchemaMinor(1.5, 1)).toBeNull();
    expect(readSchemaMinor("1.1", 1)).toBeNull();
  });
});

describe("layout decoder versioning", () => {
  it("reads the shipped 1.0 Proton layout", () => {
    expect(decodeInstrumentLayout(protonLayoutJson, reference)).not.toBeNull();
  });

  it("reads a 1.1 document that uses uni ports", () => {
    const document = encodeInstrumentLayout(withUniPort(reference));
    expect(document.schemaMinor).toBe(1);
    const decoded = decodeInstrumentLayout(JSON.parse(JSON.stringify(document)), withUniPort(reference));
    expect(decoded?.ports.find((port) => port.id === "uni-1")?.kind).toBe("uni");
  });

  it("rejects a document that adds ports the reference does not have", () => {
    expect(decodeInstrumentLayout(encodeInstrumentLayout(withUniPort(reference)), reference)).toBeNull();
  });

  it("rejects a document with a newer schemaMinor than supported", () => {
    const document = { ...protonLayoutJson, schemaMinor: 2 };
    expect(decodeInstrumentLayout(document, reference)).toBeNull();
  });

  it("rejects a different major schemaVersion", () => {
    const document = { ...protonLayoutJson, schemaVersion: 2 };
    expect(decodeInstrumentLayout(document, reference)).toBeNull();
  });

  it("ignores unknown fields", () => {
    const document = { ...protonLayoutJson, futureField: { anything: true } };
    expect(decodeInstrumentLayout(document, reference)).not.toBeNull();
  });

  it("rejects an unknown port kind", () => {
    const document = structuredClone(protonLayoutJson) as unknown as { ports: { kind: string }[] };
    document.ports[0]!.kind = "bidi";
    expect(decodeInstrumentLayout(document, reference)).toBeNull();
  });

  it("reads optional labels and falls back to the reference when absent", () => {
    const document = structuredClone(protonLayoutJson) as unknown as { knobs: { label?: string }[] };
    document.knobs[0]!.label = "Pitch";
    const decoded = decodeInstrumentLayout(document, reference);
    expect(decoded?.knobs[0]).toMatchObject({ id: "Tune 1", label: "Pitch" });
    expect(decoded?.knobs[1]?.label).toBeUndefined();
  });
});

describe("layout writer versioning", () => {
  it("writes the Proton layout byte-identical to the shipped 1.0 file", () => {
    const decoded = decodeInstrumentLayout(protonLayoutJson, reference)!;
    const written = `${JSON.stringify(encodeInstrumentLayout(decoded), null, 2)}\n`;
    expect(written).toBe(protonFile);
  });

  it("omits schemaMinor when no uni port is used", () => {
    expect(encodeInstrumentLayout(reference)).not.toHaveProperty("schemaMinor");
  });

  it("writes schemaMinor 1 only when a uni port is present", () => {
    expect(encodeInstrumentLayout(withUniPort(reference))).toMatchObject({ schemaMinor: 1 });
  });

  it("drops a stale schemaMinor when the layout no longer needs it", () => {
    const stale = { ...withUniPort(reference), schemaMinor: 1 };
    const withoutUni = { ...stale, ports: reference.ports };
    expect(encodeInstrumentLayout(withoutUni)).not.toHaveProperty("schemaMinor");
  });
});
