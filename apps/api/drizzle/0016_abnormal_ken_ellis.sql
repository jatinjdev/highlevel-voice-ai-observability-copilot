DROP INDEX "recommendations_agent_run_target_idx";--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "aggregation_key" varchar(256);--> statement-breakpoint
UPDATE "recommendations"
SET "aggregation_key" = "target_id"
WHERE "agent_analysis_run_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "recommendations_agent_run_aggregation_idx" ON "recommendations" USING btree ("agent_analysis_run_id","aggregation_key") WHERE "recommendations"."agent_analysis_run_id" is not null and "recommendations"."aggregation_key" is not null;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_agent_aggregation_key_check" CHECK ("recommendations"."agent_analysis_run_id" is null or "recommendations"."aggregation_key" is not null);
