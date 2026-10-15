CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assets_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "synth_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"synth_id" text NOT NULL,
	"number" integer NOT NULL,
	"panel_source" text NOT NULL,
	"panel_bundled_src" text,
	"panel_asset_id" text,
	"layout" jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"schema_minor" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synths" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"manufacturer" text,
	"current_revision_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "synths_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synth_revisions" ADD CONSTRAINT "synth_revisions_synth_id_synths_id_fk" FOREIGN KEY ("synth_id") REFERENCES "public"."synths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synth_revisions" ADD CONSTRAINT "synth_revisions_panel_asset_id_assets_id_fk" FOREIGN KEY ("panel_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synths" ADD CONSTRAINT "synths_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_owner_idx" ON "assets" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "synth_revisions_synth_number_idx" ON "synth_revisions" USING btree ("synth_id","number");--> statement-breakpoint
CREATE INDEX "synths_owner_idx" ON "synths" USING btree ("owner_id");