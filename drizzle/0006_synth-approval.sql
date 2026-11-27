ALTER TABLE "synths" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
-- Synths that existed before approvals stay visible: they count as approved when they were created.
UPDATE "synths" SET "approved_at" = "created_at" WHERE "approved_at" IS NULL;