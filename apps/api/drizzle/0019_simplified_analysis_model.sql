CREATE TABLE "agent_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"criterion_id" uuid NOT NULL,
	"headline" text NOT NULL,
	"explanation" text NOT NULL,
	"prompt_addition" text NOT NULL,
	"prompt_hash" varchar(64) NOT NULL,
	"sampled_failure_count" integer NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "criterion_result_action_evidence" (
	"criterion_result_id" uuid NOT NULL,
	"call_action_event_id" uuid NOT NULL,
	CONSTRAINT "criterion_result_action_evidence_criterion_result_id_call_action_event_id_pk" PRIMARY KEY("criterion_result_id","call_action_event_id")
);
--> statement-breakpoint
CREATE TABLE "recommendation_generation_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"criterion_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"last_error" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_agent_configurations" (
	"agent_id" uuid PRIMARY KEY NOT NULL,
	"current_prompt" text,
	"prompt_hash" varchar(64),
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sync_status" varchar(24) DEFAULT 'unknown' NOT NULL,
	"synced_at" timestamp with time zone,
	"criteria_initialized_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
TRUNCATE TABLE "call_analysis_runs" CASCADE;--> statement-breakpoint
TRUNCATE TABLE "success_criteria" CASCADE;--> statement-breakpoint
ALTER TABLE "agent_config_snapshots" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "analysis_releases" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "criterion_set_members" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "criterion_sets" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recommendations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "success_criterion_versions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "agent_config_snapshots" CASCADE;--> statement-breakpoint
DROP TABLE "analysis_releases" CASCADE;--> statement-breakpoint
DROP TABLE "criterion_set_members" CASCADE;--> statement-breakpoint
DROP TABLE "criterion_sets" CASCADE;--> statement-breakpoint
DROP TABLE "recommendations" CASCADE;--> statement-breakpoint
DROP TABLE "success_criterion_versions" CASCADE;--> statement-breakpoint
ALTER TABLE "call_analysis_runs" DROP CONSTRAINT IF EXISTS "call_analysis_runs_config_snapshot_id_agent_config_snapshots_id_fk";
--> statement-breakpoint
ALTER TABLE "call_analysis_runs" DROP CONSTRAINT IF EXISTS "call_analysis_runs_criterion_set_id_criterion_sets_id_fk";
--> statement-breakpoint
ALTER TABLE "call_analysis_runs" DROP CONSTRAINT IF EXISTS "call_analysis_runs_analysis_release_id_analysis_releases_id_fk";
--> statement-breakpoint
ALTER TABLE "criterion_results" DROP CONSTRAINT IF EXISTS "criterion_results_criterion_version_id_success_criterion_versions_id_fk";
--> statement-breakpoint
ALTER TABLE "voice_calls" DROP CONSTRAINT IF EXISTS "voice_calls_agent_config_snapshot_id_agent_config_snapshots_id_fk";
--> statement-breakpoint
DROP INDEX "success_criteria_agent_key_idx";--> statement-breakpoint
DROP INDEX "success_criteria_agent_state_idx";--> statement-breakpoint
DROP INDEX "criterion_results_run_criterion_idx";--> statement-breakpoint
ALTER TABLE "criterion_results" ADD COLUMN "criterion_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "success_criteria" ADD COLUMN "name" varchar(96) NOT NULL;--> statement-breakpoint
ALTER TABLE "success_criteria" ADD COLUMN "normalized_name" varchar(96) NOT NULL;--> statement-breakpoint
ALTER TABLE "success_criteria" ADD COLUMN "description" text NOT NULL;--> statement-breakpoint
ALTER TABLE "success_criteria" ADD COLUMN "source" varchar(24) DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_recommendations" ADD CONSTRAINT "agent_recommendations_agent_id_voice_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."voice_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_recommendations" ADD CONSTRAINT "agent_recommendations_criterion_id_success_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."success_criteria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterion_result_action_evidence" ADD CONSTRAINT "criterion_result_action_evidence_criterion_result_id_criterion_results_id_fk" FOREIGN KEY ("criterion_result_id") REFERENCES "public"."criterion_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterion_result_action_evidence" ADD CONSTRAINT "criterion_result_action_evidence_call_action_event_id_call_action_events_id_fk" FOREIGN KEY ("call_action_event_id") REFERENCES "public"."call_action_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_generation_states" ADD CONSTRAINT "recommendation_generation_states_agent_id_voice_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."voice_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_generation_states" ADD CONSTRAINT "recommendation_generation_states_criterion_id_success_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."success_criteria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_agent_configurations" ADD CONSTRAINT "voice_agent_configurations_agent_id_voice_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."voice_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_recommendations_agent_criterion_idx" ON "agent_recommendations" USING btree ("agent_id","criterion_id");--> statement-breakpoint
CREATE INDEX "agent_recommendations_agent_generated_idx" ON "agent_recommendations" USING btree ("agent_id","generated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_generation_states_request_idx" ON "recommendation_generation_states" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_generation_states_agent_criterion_idx" ON "recommendation_generation_states" USING btree ("agent_id","criterion_id");--> statement-breakpoint
CREATE INDEX "voice_agent_configurations_sync_idx" ON "voice_agent_configurations" USING btree ("sync_status","synced_at");--> statement-breakpoint
ALTER TABLE "criterion_results" ADD CONSTRAINT "criterion_results_criterion_id_success_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."success_criteria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "criterion_results_criterion_result_idx" ON "criterion_results" USING btree ("criterion_id","result");--> statement-breakpoint
CREATE UNIQUE INDEX "success_criteria_agent_name_idx" ON "success_criteria" USING btree ("agent_id","normalized_name");--> statement-breakpoint
CREATE INDEX "success_criteria_agent_created_idx" ON "success_criteria" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "criterion_results_run_criterion_idx" ON "criterion_results" USING btree ("analysis_run_id","criterion_id");--> statement-breakpoint
ALTER TABLE "call_analysis_runs" DROP COLUMN "config_snapshot_id";--> statement-breakpoint
ALTER TABLE "call_analysis_runs" DROP COLUMN "criterion_set_id";--> statement-breakpoint
ALTER TABLE "call_analysis_runs" DROP COLUMN "analysis_release_id";--> statement-breakpoint
ALTER TABLE "criterion_results" DROP COLUMN "criterion_version_id";--> statement-breakpoint
ALTER TABLE "success_criteria" DROP COLUMN "stable_key";--> statement-breakpoint
ALTER TABLE "success_criteria" DROP COLUMN "origin";--> statement-breakpoint
ALTER TABLE "success_criteria" DROP COLUMN "criterion_class";--> statement-breakpoint
ALTER TABLE "success_criteria" DROP COLUMN "lifecycle_state";--> statement-breakpoint
ALTER TABLE "voice_calls" DROP COLUMN "agent_config_snapshot_id";
