CREATE TABLE "patch_samples" (
	"patch_id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"title" text NOT NULL,
	"license" text NOT NULL,
	"rights_confirmed_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patch_samples" ADD CONSTRAINT "patch_samples_patch_id_patches_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."patches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patch_samples" ADD CONSTRAINT "patch_samples_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;