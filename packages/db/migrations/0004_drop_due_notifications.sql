-- Contract step for the removed due-date notifications. No API revision that writes `due`
-- has been deployed (no deploy/ versions exist), so it runs in the same change as the code
-- (docs/04_deployment-procedure.md 4.1).
DELETE FROM "notifications" WHERE "kind" = 'due';--> statement-breakpoint
DROP INDEX "notifications_due_once_uq";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_execution_item_id_execution_items_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."notification_kind";--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('mention', 'comment', 'decision');--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "kind" SET DATA TYPE "public"."notification_kind" USING "kind"::"public"."notification_kind";--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "execution_item_id";--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "due_stage";--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "due_date";--> statement-breakpoint
DROP TYPE "public"."due_stage";