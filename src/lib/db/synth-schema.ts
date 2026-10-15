import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "@/lib/db/auth-schema";

/** Uploaded files. Only the relative storage key is stored, never a URL. */
export const assets = pgTable(
  "assets",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    mime: text("mime").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    sha256: text("sha256").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("assets_owner_idx").on(table.ownerId)],
);

/** Owner null marks built-in synths (e.g. Behringer Proton). */
export const synths = pgTable(
  "synths",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    displayName: text("display_name").notNull(),
    manufacturer: text("manufacturer"),
    currentRevisionId: text("current_revision_id"),
    /** Soft delete: deleted synths are hidden everywhere; a later cleanup feature removes them for good. */
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("synths_owner_idx").on(table.ownerId)],
);

/** Immutable snapshots. Patches will reference a revision, not the synth itself. */
export const synthRevisions = pgTable(
  "synth_revisions",
  {
    id: text("id").primaryKey(),
    synthId: text("synth_id").notNull().references(() => synths.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    panelSource: text("panel_source").notNull(),
    panelBundledSrc: text("panel_bundled_src"),
    panelAssetId: text("panel_asset_id").references(() => assets.id, { onDelete: "restrict" }),
    layout: jsonb("layout").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    schemaMinor: integer("schema_minor").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("synth_revisions_synth_number_idx").on(table.synthId, table.number)],
);

export const tags = pgTable("tags", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  kind: text("kind").notNull(),
});

/** Patch data is a JSONB document (knobs, switches, leds, cables) with schemaVersion and schemaMinor inside. */
export const patches = pgTable(
  "patches",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    synthRevisionId: text("synth_revision_id").notNull().references(() => synthRevisions.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    visibility: text("visibility").$type<"private" | "public">().notNull(),
    revision: integer("revision").notNull().default(1),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("patches_owner_updated_idx").on(table.ownerId, table.updatedAt),
    index("patches_visibility_updated_idx").on(table.visibility, table.updatedAt),
  ],
);

export const patchTags = pgTable(
  "patch_tags",
  {
    patchId: text("patch_id").notNull().references(() => patches.id, { onDelete: "cascade" }),
    tagId: text("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.patchId, table.tagId] }),
    index("patch_tags_tag_idx").on(table.tagId),
  ],
);

/** At most one audio sample per patch. The audio file itself lives in assets (kind sample). */
export const patchSamples = pgTable("patch_samples", {
  patchId: text("patch_id").primaryKey().references(() => patches.id, { onDelete: "cascade" }),
  assetId: text("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  license: text("license").notNull(),
  rightsConfirmedAt: timestamp("rights_confirmed_at").notNull(),
});
