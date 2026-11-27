ALTER TABLE "user" DROP CONSTRAINT "user_role_check";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "disabledAt" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_role_check" CHECK ("user"."role" in ('user', 'admin', 'owner'));