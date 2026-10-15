CREATE TABLE "patch_tags" (
	"patch_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "patch_tags_patch_id_tag_id_pk" PRIMARY KEY("patch_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "patches" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"synth_revision_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"visibility" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "patch_tags" ADD CONSTRAINT "patch_tags_patch_id_patches_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patch_tags" ADD CONSTRAINT "patch_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patches" ADD CONSTRAINT "patches_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patches" ADD CONSTRAINT "patches_synth_revision_id_synth_revisions_id_fk" FOREIGN KEY ("synth_revision_id") REFERENCES "public"."synth_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patch_tags_tag_idx" ON "patch_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "patches_owner_updated_idx" ON "patches" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "patches_visibility_updated_idx" ON "patches" USING btree ("visibility","updated_at");