import { z } from "zod";
import { normalizePatchDataForLayout } from "@/lib/adapters/patch-adapter";
import { SLUG_PATTERN } from "@/lib/adapters/synth-layout-adapter";
import { readSchemaMinor } from "@/lib/domain/schema-version";
import type { PatchData } from "@/lib/domain/types";
import type { InstrumentLayout } from "@/lib/instrument/layout";

/** Patch documents: version 1, minor 1 when a cable uses a uni port. Same rule as the library exports. */
export const PATCH_DOCUMENT_SCHEMA_VERSION = 1;
export const PATCH_DOCUMENT_SCHEMA_MINOR = 1;

type LayoutControls = Pick<InstrumentLayout, "knobs" | "switches" | "leds" | "ports">;

/** Drops values for controls the layout does not have (e.g. after a revision removed them). */
export function restrictToLayout(data: PatchData, layout: LayoutControls): PatchData {
  const pick = (values: Record<string, boolean | number>, ids: readonly string[]) =>
    Object.fromEntries(Object.entries(values).filter(([id]) => ids.includes(id)));
  return {
    knobs: pick(data.knobs, layout.knobs.map((knob) => knob.id)) as Record<string, number>,
    switches: pick(data.switches, layout.switches.map((item) => item.id)) as Record<string, boolean>,
    leds: pick(data.leds, layout.leds.map((led) => led.id)) as Record<string, boolean>,
    cables: data.cables,
  };
}

export function encodePatchDocument(data: PatchData, layout: LayoutControls): Record<string, unknown> {
  const uniPortIds = new Set(layout.ports.filter((port) => port.kind === "uni").map((port) => port.id));
  const usesUni = data.cables.some((cable) => uniPortIds.has(cable.from) || uniPortIds.has(cable.to));
  return {
    schemaVersion: PATCH_DOCUMENT_SCHEMA_VERSION,
    ...(usesUni ? { schemaMinor: PATCH_DOCUMENT_SCHEMA_MINOR } : {}),
    knobs: data.knobs,
    switches: data.switches,
    leds: data.leds,
    cables: data.cables,
  };
}

const documentHeader = z.object({
  schemaVersion: z.literal(PATCH_DOCUMENT_SCHEMA_VERSION),
  schemaMinor: z.number().int().optional(),
});

/** Reads a stored or submitted patch document against the layout of its synth revision. */
export function decodePatchDocument(value: unknown, layout: LayoutControls): PatchData | null {
  const header = documentHeader.safeParse(value);
  if (!header.success) return null;
  if (readSchemaMinor(header.data.schemaMinor, PATCH_DOCUMENT_SCHEMA_MINOR) === null) return null;
  return restrictToLayout(normalizePatchDataForLayout(value, layout), layout);
}

const patchFields = {
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  visibility: z.enum(["private", "public"]).optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
  data: z.unknown().optional(),
};

export const patchCreateSchema = z.object({
  /** Optional client-generated UUID, so the browser keeps its own ID across the first save. */
  id: z.string().uuid().optional(),
  synthSlug: z.string().regex(SLUG_PATTERN),
  ...patchFields,
});

export const patchUpdateSchema = z.object({
  ...patchFields,
  expectedRevision: z.number().int().min(0),
});

export type PatchCreateInput = z.infer<typeof patchCreateSchema>;
export type PatchUpdateInput = z.infer<typeof patchUpdateSchema>;

/** Input for importing a local (browser) library into the account. Data is normalized, never trusted. */
export const localImportSchema = z.object({
  synthSlug: z.string().regex(SLUG_PATTERN),
  patches: z
    .array(z.object({ id: z.string().trim().min(1).max(128).optional(), name: z.string().trim().min(1).max(80), data: z.unknown().optional() }))
    .min(1)
    .max(100),
});

/** Normalizes user-submitted patch data (no version header required, unlike stored documents). */
export function normalizeSubmittedData(value: unknown, layout: LayoutControls): PatchData {
  return restrictToLayout(normalizePatchDataForLayout(value, layout), layout);
}
