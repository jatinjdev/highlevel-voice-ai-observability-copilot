DROP INDEX "recommendations_active_deduplication_idx";--> statement-breakpoint
WITH ranked AS (
	SELECT "id",
		row_number() OVER (
			PARTITION BY "call_analysis_run_id", "target_id"
			ORDER BY "created_at", "id"
		) AS duplicate_rank
	FROM "recommendations"
	WHERE "call_analysis_run_id" IS NOT NULL
)
DELETE FROM "recommendations"
WHERE "id" IN (SELECT "id" FROM ranked WHERE duplicate_rank > 1);--> statement-breakpoint
WITH ranked AS (
	SELECT "id",
		row_number() OVER (
			PARTITION BY "agent_analysis_run_id", "target_id"
			ORDER BY "created_at", "id"
		) AS duplicate_rank
	FROM "recommendations"
	WHERE "agent_analysis_run_id" IS NOT NULL
)
DELETE FROM "recommendations"
WHERE "id" IN (SELECT "id" FROM ranked WHERE duplicate_rank > 1);--> statement-breakpoint
CREATE UNIQUE INDEX "recommendations_call_run_target_idx" ON "recommendations" USING btree ("call_analysis_run_id","target_id") WHERE "recommendations"."call_analysis_run_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "recommendations_agent_run_target_idx" ON "recommendations" USING btree ("agent_analysis_run_id","target_id") WHERE "recommendations"."agent_analysis_run_id" is not null;
