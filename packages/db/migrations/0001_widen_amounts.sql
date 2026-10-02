ALTER TABLE "competitors" ALTER COLUMN "typical_price" SET DATA TYPE numeric(15, 2);--> statement-breakpoint
ALTER TABLE "cost_items" ALTER COLUMN "amount" SET DATA TYPE numeric(15, 2);--> statement-breakpoint
ALTER TABLE "economics_inputs" ALTER COLUMN "value" SET DATA TYPE numeric(17, 4);--> statement-breakpoint
ALTER TABLE "self_analysis_answers" ALTER COLUMN "amount" SET DATA TYPE numeric(15, 2);