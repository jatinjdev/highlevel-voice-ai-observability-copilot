TRUNCATE TABLE "recommendations", "criterion_result_evidence", "criterion_results" CASCADE;--> statement-breakpoint
DELETE FROM "call_analysis_runs";--> statement-breakpoint
DELETE FROM "message_outbox" WHERE "event_type" = 'agent.analysis.requested';--> statement-breakpoint
ALTER TABLE "agent_aggregation_jobs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_analysis_runs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_insight_calls" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_insights" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "call_sentiment_summaries" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evidence_citations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "finding_evidence" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "findings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recommendation_catalogue_entries" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recommendation_findings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sentiment_observations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "agent_aggregation_jobs" CASCADE;--> statement-breakpoint
DROP TABLE "agent_analysis_runs" CASCADE;--> statement-breakpoint
DROP TABLE "agent_insight_calls" CASCADE;--> statement-breakpoint
DROP TABLE "agent_insights" CASCADE;--> statement-breakpoint
DROP TABLE "call_sentiment_summaries" CASCADE;--> statement-breakpoint
DROP TABLE "evidence_citations" CASCADE;--> statement-breakpoint
DROP TABLE "finding_evidence" CASCADE;--> statement-breakpoint
DROP TABLE "findings" CASCADE;--> statement-breakpoint
DROP TABLE "recommendation_catalogue_entries" CASCADE;--> statement-breakpoint
DROP TABLE "recommendation_findings" CASCADE;--> statement-breakpoint
DROP TABLE "sentiment_observations" CASCADE;--> statement-breakpoint
ALTER TABLE "criterion_results" RENAME COLUMN "status" TO "result";--> statement-breakpoint
ALTER TABLE "recommendations" RENAME COLUMN "rationale" TO "reason";--> statement-breakpoint
ALTER TABLE "recommendations" DROP CONSTRAINT "recommendations_exactly_one_scope_check";--> statement-breakpoint
ALTER TABLE "recommendations" DROP CONSTRAINT "recommendations_manual_execution_check";--> statement-breakpoint
ALTER TABLE "recommendations" DROP CONSTRAINT "recommendations_agent_aggregation_key_check";--> statement-breakpoint
ALTER TABLE "recommendations" DROP CONSTRAINT "recommendations_call_analysis_run_id_call_analysis_runs_id_fk";
--> statement-breakpoint
DROP INDEX "criterion_results_status_idx";--> statement-breakpoint
DROP INDEX "recommendations_agent_status_idx";--> statement-breakpoint
DROP INDEX "recommendations_call_run_change_idx";--> statement-breakpoint
DROP INDEX "recommendations_agent_run_aggregation_idx";--> statement-breakpoint
ALTER TABLE "criterion_result_evidence" DROP CONSTRAINT "criterion_result_evidence_criterion_result_id_evidence_citation_id_pk";--> statement-breakpoint
ALTER TABLE "recommendations" ALTER COLUMN "ui_path" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "criterion_result_evidence" ADD COLUMN "call_turn_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "criterion_result_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "type" varchar(32) NOT NULL;--> statement-breakpoint
ALTER TABLE "criterion_result_evidence" ADD CONSTRAINT "criterion_result_evidence_criterion_result_id_call_turn_id_pk" PRIMARY KEY("criterion_result_id","call_turn_id");--> statement-breakpoint
ALTER TABLE "criterion_result_evidence" ADD CONSTRAINT "criterion_result_evidence_call_turn_id_call_turns_id_fk" FOREIGN KEY ("call_turn_id") REFERENCES "public"."call_turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_criterion_result_id_criterion_results_id_fk" FOREIGN KEY ("criterion_result_id") REFERENCES "public"."criterion_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "criterion_results_result_idx" ON "criterion_results" USING btree ("result");--> statement-breakpoint
CREATE INDEX "recommendations_agent_idx" ON "recommendations" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendations_result_target_idx" ON "recommendations" USING btree ("criterion_result_id","target_id");--> statement-breakpoint
ALTER TABLE "call_analysis_runs" DROP COLUMN "outcome";--> statement-breakpoint
ALTER TABLE "call_analysis_runs" DROP COLUMN "intent_key";--> statement-breakpoint
ALTER TABLE "call_analysis_runs" DROP COLUMN "summary";--> statement-breakpoint
ALTER TABLE "call_analysis_runs" DROP COLUMN "evidence_coverage";--> statement-breakpoint
ALTER TABLE "criterion_result_evidence" DROP COLUMN "evidence_citation_id";--> statement-breakpoint
ALTER TABLE "criterion_results" DROP COLUMN "assessor";--> statement-breakpoint
ALTER TABLE "recommendations" DROP COLUMN "call_analysis_run_id";--> statement-breakpoint
ALTER TABLE "recommendations" DROP COLUMN "agent_analysis_run_id";--> statement-breakpoint
ALTER TABLE "recommendations" DROP COLUMN "aggregation_key";--> statement-breakpoint
ALTER TABLE "recommendations" DROP COLUMN "catalogue_version";--> statement-breakpoint
ALTER TABLE "recommendations" DROP COLUMN "tier";--> statement-breakpoint
ALTER TABLE "recommendations" DROP COLUMN "verification_plan";--> statement-breakpoint
ALTER TABLE "recommendations" DROP COLUMN "missing_evidence";--> statement-breakpoint
ALTER TABLE "recommendations" DROP COLUMN "evidence_policy";--> statement-breakpoint
ALTER TABLE "recommendations" DROP COLUMN "execution_mode";--> statement-breakpoint
ALTER TABLE "recommendations" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "recommendations" DROP COLUMN "deduplication_key";
