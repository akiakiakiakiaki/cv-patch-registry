import { z } from "zod";
import { LAYOUT_SCHEMA_MINOR, encodeInstrumentLayout } from "@/lib/adapters/instrument-layout-adapter";
import type { ControlKind } from "@/lib/domain/control-ids";
import type { ControlCategory, InstrumentLayout, KnobDefinition, PatchPort, SwitchDefinition } from "@/lib/instrument/layout";
import { CATEGORY_COLOR_PATTERN, CATEGORY_ID_PATTERN, categoryIssues, usesCategories } from "@/lib/domain/switch-categories";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";

/** Geometry and knob angles are shared defaults for user-built synths (same hardware language as Proton). */
const DEFAULTS = behringerProton.layout;

export const CONTROL_KINDS = ["knob", "switch", "led", "in", "out", "uni"] as const;
export const CONTROL_ID_PATTERN = /^(knob|switch|led|in|out|uni)-[a-f0-9]{8}$/;
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

const MAX_CATEGORIES = 32;

const categorySchema = z.object({
  id: z.string().regex(CATEGORY_ID_PATTERN),
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(CATEGORY_COLOR_PATTERN),
});

/** Category references and switch roles shared by the editor draft and the stored layout. */
const categoryFields = {
  category: z.string().regex(CATEGORY_ID_PATTERN).optional(),
  selects: z.array(z.string().regex(CATEGORY_ID_PATTERN)).max(MAX_CATEGORIES).optional(),
  dependsOn: z.string().min(1).optional(),
};

const controlSchema = z.object({
  id: z.string().regex(CONTROL_ID_PATTERN),
  kind: z.enum(CONTROL_KINDS),
  label: z.string().trim().min(1).max(40),
  x: z.number().finite(),
  y: z.number().finite(),
  color: z.enum(["red", "blue", "amber"]).optional(),
  ...categoryFields,
});

/** Input from the editor. Validated here, mapped to a layout document in one place. */
export const synthDraftSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  slug: z.string().regex(SLUG_PATTERN),
  manufacturer: z.string().trim().max(80).optional(),
  panelAssetId: z.string().min(1).optional(),
  expectedRevision: z.number().int().min(0).optional(),
  categories: z.array(categorySchema).max(MAX_CATEGORIES).optional(),
  controls: z.array(controlSchema).max(200),
});

export type SynthDraft = z.infer<typeof synthDraftSchema>;
export type DraftControl = SynthDraft["controls"][number];

export type DraftParse = { ok: true; draft: SynthDraft } | { ok: false; issues: string[] };

export function parseSynthDraft(value: unknown): DraftParse {
  const result = synthDraftSchema.safeParse(value);
  if (!result.success) return { ok: false, issues: result.error.issues.map((issue) => issue.path.join(".") || issue.message) };
  const duplicate = findDuplicateId(result.data.controls);
  if (duplicate) return { ok: false, issues: [`controls.${duplicate}`] };
  return { ok: true, draft: result.data };
}

function findDuplicateId(controls: readonly DraftControl[]): string | null {
  const seen = new Set<string>();
  for (const control of controls) {
    if (seen.has(control.id)) return control.id;
    seen.add(control.id);
  }
  return null;
}

/** Maps a validated draft to a layout document. Positions must lie inside the panel. */
export function draftToLayout(
  draft: SynthDraft,
  panel: { width: number; height: number },
  layoutVersion: number,
): { ok: true; layout: InstrumentLayout } | { ok: false; issues: string[] } {
  const outside = draft.controls.find(
    (control) => control.x < 0 || control.y < 0 || control.x > panel.width || control.y > panel.height,
  );
  if (outside) return { ok: false, issues: [`controls.${outside.id}.position`] };

  const at = (control: DraftControl) => ({ id: control.id, label: control.label, x: control.x, y: control.y });
  const knobOf = (control: DraftControl): KnobDefinition => ({ ...at(control), ...(control.category ? { category: control.category } : {}) });
  const switchOf = (control: DraftControl): SwitchDefinition => ({
    ...at(control),
    ...(control.category ? { category: control.category } : {}),
    ...(control.selects ? { selects: control.selects } : {}),
    ...(control.dependsOn ? { dependsOn: control.dependsOn } : {}),
  });
  const controls = draft.controls;
  const categories: ControlCategory[] = draft.categories ?? [];
  const ports: PatchPort[] = controls
    .filter((control) => control.kind === "in" || control.kind === "out" || control.kind === "uni")
    .map((control) => ({ ...at(control), kind: control.kind as "in" | "out" | "uni", label: control.label }));

  const layout: InstrumentLayout = {
    schemaVersion: 1,
    layoutVersion,
    id: draft.slug,
    displayName: draft.displayName,
    viewBox: { width: panel.width, height: panel.height },
    geometry: DEFAULTS.geometry,
    knobStartAngle: DEFAULTS.knobStartAngle,
    knobSweepAngle: DEFAULTS.knobSweepAngle,
    ...(categories.length ? { categories } : {}),
    knobs: controls.filter((control) => control.kind === "knob").map(knobOf),
    switches: controls.filter((control) => control.kind === "switch").map(switchOf),
    leds: controls
      .filter((control) => control.kind === "led")
      .map((control) => ({ ...at(control), color: control.color ?? "red" })),
    ports,
  };
  const issues = categoryIssues(layout);
  if (issues.length > 0) return { ok: false, issues: issues.map((issue) => `categories.${issue.code}`) };
  return { ok: true, layout: encodeInstrumentLayout(layout) };
}

const pointSchema = z.object({ id: z.string().min(1), label: z.string().optional(), x: z.number().finite(), y: z.number().finite() });
const portSchema = pointSchema.extend({ label: z.string().min(1), kind: z.enum(["in", "out", "uni"]) });
const circleSchema = z.object({ shape: z.literal("circle"), hitRadius: z.number() });
const rectSchema = z.object({ shape: z.literal("rect"), width: z.number(), height: z.number(), cornerRadius: z.number() });

const layoutDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  schemaMinor: z.number().int().min(0).max(LAYOUT_SCHEMA_MINOR).optional(),
  layoutVersion: z.number().int().min(1),
  id: z.string().regex(SLUG_PATTERN),
  displayName: z.string().min(1),
  viewBox: z.object({ width: z.number().positive(), height: z.number().positive() }),
  geometry: z.object({
    knob: z.object({ shape: z.literal("circle"), hitRadius: z.number(), indicatorLength: z.number(), indicatorWidth: z.number() }),
    switch: rectSchema,
    led: circleSchema,
    port: z.object({ shape: z.literal("circle"), hitRadius: z.number(), connectionRadius: z.number(), endpointRadius: z.number() }),
    cable: z.object({ lineWidth: z.number(), hitAreaWidth: z.number() }),
  }),
  knobStartAngle: z.number(),
  knobSweepAngle: z.number(),
  categories: z.array(categorySchema).max(MAX_CATEGORIES).optional(),
  knobs: z.array(pointSchema.extend({ category: categoryFields.category })),
  switches: z.array(pointSchema.extend(categoryFields)),
  leds: z.array(pointSchema.extend({ color: z.enum(["red", "blue", "amber"]) })),
  ports: z.array(portSchema),
});

/**
 * Reads a stored layout document. Unlike the Proton decoder there is no reference layout, so the
 * structure is checked here: versions, positions inside the viewBox, unique IDs, and uni ports only with schemaMinor 1.
 */
export function parseSynthLayout(value: unknown): InstrumentLayout | null {
  const result = layoutDocumentSchema.safeParse(value);
  if (!result.success) return null;
  const layout = result.data;
  const { width, height } = layout.viewBox;
  const points = [...layout.knobs, ...layout.switches, ...layout.leds, ...layout.ports];
  const ids = new Set(points.map((point) => point.id));
  if (ids.size !== points.length) return null;
  if (points.some((point) => point.x < 0 || point.y < 0 || point.x > width || point.y > height)) return null;
  const hasUni = layout.ports.some((port) => port.kind === "uni");
  if (hasUni && (layout.schemaMinor ?? 0) < 1) return null;
  const typed = layout as unknown as InstrumentLayout;
  if (usesCategories(typed) && (layout.schemaMinor ?? 0) < 2) return null;
  if (categoryIssues(typed).length > 0) return null;
  return typed;
}

export function controlKindOf(id: string): ControlKind | null {
  const match = CONTROL_ID_PATTERN.exec(id);
  return match ? (match[1] as ControlKind) : null;
}

/** Draft controls from a stored layout, the inverse of draftToLayout. Labels fall back to the ID for legacy controls. */
export function draftControlsFromLayout(layout: InstrumentLayout): DraftControl[] {
  const fromPoints = (
    kind: ControlKind,
    points: readonly { id: string; label?: string; x: number; y: number; category?: string; selects?: readonly string[]; dependsOn?: string }[],
  ) =>
    points.map((point) => ({
      id: point.id,
      kind,
      label: point.label ?? point.id,
      x: point.x,
      y: point.y,
      ...(point.category ? { category: point.category } : {}),
      ...(point.selects ? { selects: [...point.selects] } : {}),
      ...(point.dependsOn ? { dependsOn: point.dependsOn } : {}),
    }));
  return [
    ...fromPoints("knob", layout.knobs),
    ...fromPoints("switch", layout.switches),
    ...layout.leds.map((led) => ({ id: led.id, kind: "led" as const, label: led.label ?? led.id, x: led.x, y: led.y, color: led.color })),
    ...layout.ports.map((port) => ({ id: port.id, kind: port.kind, label: port.label, x: port.x, y: port.y })),
  ];
}
