CREATE TABLE "agent_analysis_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"criterion_set_id" uuid NOT NULL,
	"cohort_definition" jsonb NOT NULL,
	"call_analysis_cutoff_at" timestamp with time zone NOT NULL,
	"input_fingerprint" varchar(64) NOT NULL,
	"status" varchar(24) DEFAULT 'processing' NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"summary" jsonb NOT NULL,
	"provider" varchar(48),
	"model" varchar(128),
	"evaluator_version" varchar(48) NOT NULL,
	"last_error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_config_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"source_hash" varchar(64) NOT NULL,
	"source" varchar(24) NOT NULL,
	"configuration" jsonb NOT NULL,
	"evidence_capabilities" jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_insight_calls" (
	"agent_insight_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"call_analysis_run_id" uuid NOT NULL,
	"criterion_result_id" uuid,
	CONSTRAINT "agent_insight_calls_agent_insight_id_call_analysis_run_id_pk" PRIMARY KEY("agent_insight_id","call_analysis_run_id")
);
--> statement-breakpoint
CREATE TABLE "agent_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_analysis_run_id" uuid NOT NULL,
	"criterion_version_id" uuid,
	"kind" varchar(32) NOT NULL,
	"severity" varchar(24) NOT NULL,
	"title" text NOT NULL,
	"narrative" text NOT NULL,
	"evidence_strength" varchar(24) NOT NULL,
	"assessed_call_count" integer NOT NULL,
	"clear_count" integer DEFAULT 0 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"critical_count" integer DEFAULT 0 NOT NULL,
	"intent_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config_snapshot_breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_action_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"highlevel_action_id" varchar(64),
	"action_type" varchar(48),
	"action_name" text,
	"outcome" varchar(24),
	"result_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_occurred_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "call_analysis_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid NOT NULL,
	"config_snapshot_id" uuid NOT NULL,
	"criterion_set_id" uuid NOT NULL,
	"run_sequence" integer NOT NULL,
	"run_reason" varchar(24) DEFAULT 'initial' NOT NULL,
	"input_fingerprint" varchar(64) NOT NULL,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"outcome" varchar(24),
	"intent_key" varchar(96),
	"summary" text,
	"evidence_coverage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provider" varchar(48),
	"model" varchar(128),
	"model_parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evaluator_version" varchar(48) NOT NULL,
	"output_schema_version" integer DEFAULT 1 NOT NULL,
	"code_version" varchar(64),
	"is_current" boolean DEFAULT false NOT NULL,
	"lease_token" uuid,
	"leased_until" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_sentiment_summaries" (
	"analysis_run_id" uuid PRIMARY KEY NOT NULL,
	"dominant_label" varchar(16) NOT NULL,
	"positive_turn_count" integer DEFAULT 0 NOT NULL,
	"neutral_turn_count" integer DEFAULT 0 NOT NULL,
	"negative_turn_count" integer DEFAULT 0 NOT NULL,
	"observable_customer_turn_count" integer DEFAULT 0 NOT NULL,
	"ending_label" varchar(16),
	"rationale" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"speaker" varchar(16) NOT NULL,
	"text" text NOT NULL,
	"source_start_ms" integer,
	"source_end_ms" integer
);
--> statement-breakpoint
CREATE TABLE "criterion_result_evidence" (
	"criterion_result_id" uuid NOT NULL,
	"evidence_citation_id" uuid NOT NULL,
	CONSTRAINT "criterion_result_evidence_criterion_result_id_evidence_citation_id_pk" PRIMARY KEY("criterion_result_id","evidence_citation_id")
);
--> statement-breakpoint
CREATE TABLE "criterion_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"criterion_version_id" uuid NOT NULL,
	"status" varchar(24) NOT NULL,
	"assessor" varchar(24) NOT NULL,
	"rationale" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "criterion_set_members" (
	"criterion_set_id" uuid NOT NULL,
	"criterion_version_id" uuid NOT NULL,
	"display_order" integer NOT NULL,
	CONSTRAINT "criterion_set_members_criterion_set_id_criterion_version_id_pk" PRIMARY KEY("criterion_set_id","criterion_version_id")
);
--> statement-breakpoint
CREATE TABLE "criterion_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"call_turn_id" uuid NOT NULL,
	"quote" text NOT NULL,
	"start_character" integer,
	"end_character" integer,
	"evidence_type" varchar(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finding_evidence" (
	"finding_id" uuid NOT NULL,
	"evidence_citation_id" uuid NOT NULL,
	CONSTRAINT "finding_evidence_finding_id_evidence_citation_id_pk" PRIMARY KEY("finding_id","evidence_citation_id")
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"criterion_result_id" uuid,
	"kind" varchar(32) NOT NULL,
	"severity" varchar(24) NOT NULL,
	"title" text NOT NULL,
	"explanation" text NOT NULL,
	"root_cause_category" varchar(48),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_catalogue_entries" (
	"catalogue_version" varchar(48) NOT NULL,
	"target_id" varchar(128) NOT NULL,
	"tier" varchar(16) NOT NULL,
	"category" varchar(64) NOT NULL,
	"title" text NOT NULL,
	"ui_path" text NOT NULL,
	"api_documentation_status" varchar(32),
	"evidence_policy" jsonb NOT NULL,
	"required_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"guardrails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validation_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendation_catalogue_entries_catalogue_version_target_id_pk" PRIMARY KEY("catalogue_version","target_id")
);
--> statement-breakpoint
CREATE TABLE "recommendation_findings" (
	"recommendation_id" uuid NOT NULL,
	"finding_id" uuid NOT NULL,
	CONSTRAINT "recommendation_findings_recommendation_id_finding_id_pk" PRIMARY KEY("recommendation_id","finding_id")
);
--> statement-breakpoint
CREATE TABLE "sentiment_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"call_turn_id" uuid NOT NULL,
	"valence" integer NOT NULL,
	"label" varchar(16) NOT NULL,
	"rationale" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sentiment_observations_valence_check" CHECK ("sentiment_observations"."valence" between -2 and 2)
);
--> statement-breakpoint
CREATE TABLE "success_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"stable_key" varchar(96) NOT NULL,
	"origin" varchar(32) NOT NULL,
	"criterion_class" varchar(24) NOT NULL,
	"lifecycle_state" varchar(24) DEFAULT 'draft' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "success_criterion_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criterion_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"natural_language_rule" text NOT NULL,
	"applicability_definition" jsonb NOT NULL,
	"evaluation_instructions" text NOT NULL,
	"required_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"severity_policy" jsonb NOT NULL,
	"source_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_recommendation_target_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"compiler_version" varchar(48) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"highlevel_agent_id" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"lifecycle_state" varchar(24) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"agent_config_snapshot_id" uuid NOT NULL,
	"source_webhook_inbox_id" uuid,
	"highlevel_call_id" varchar(64) NOT NULL,
	"contact_id" varchar(64),
	"direction" varchar(16),
	"source_transcript" text NOT NULL,
	"source_summary" text,
	"duration_seconds" integer NOT NULL,
	"extracted_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_trial" boolean DEFAULT false NOT NULL,
	"call_created_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "analyses" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "calls" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "metric_results" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rubrics" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sentiment_assessments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "agents" CASCADE;--> statement-breakpoint
DROP TABLE "analyses" CASCADE;--> statement-breakpoint
DROP TABLE "calls" CASCADE;--> statement-breakpoint
DROP TABLE "metric_results" CASCADE;--> statement-breakpoint
DROP TABLE "rubrics" CASCADE;--> statement-breakpoint
DROP TABLE "sentiment_assessments" CASCADE;--> statement-breakpoint
DROP TABLE "recommendations" CASCADE;--> statement-breakpoint
DROP TABLE "user_actions" CASCADE;--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"call_analysis_run_id" uuid,
	"agent_analysis_run_id" uuid,
	"catalogue_version" varchar(48) NOT NULL,
	"target_id" varchar(128) NOT NULL,
	"tier" varchar(16) NOT NULL,
	"title" text NOT NULL,
	"rationale" text NOT NULL,
	"proposed_change" text NOT NULL,
	"ui_path" text NOT NULL,
	"verification_plan" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_policy" jsonb NOT NULL,
	"execution_mode" varchar(32) DEFAULT 'manual_highlevel_ui' NOT NULL,
	"status" varchar(24) DEFAULT 'suggested' NOT NULL,
	"deduplication_key" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "user_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"finding_id" uuid,
	"kind" varchar(32) NOT NULL,
	"urgency" varchar(16) DEFAULT 'normal' NOT NULL,
	"title" text NOT NULL,
	"rationale" text NOT NULL,
	"status" varchar(24) DEFAULT 'open' NOT NULL,
	"created_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "agent_analysis_runs" ADD CONSTRAINT "agent_analysis_runs_agent_id_voice_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."voice_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_analysis_runs" ADD CONSTRAINT "agent_analysis_runs_criterion_set_id_criterion_sets_id_fk" FOREIGN KEY ("criterion_set_id") REFERENCES "public"."criterion_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_config_snapshots" ADD CONSTRAINT "agent_config_snapshots_agent_id_voice_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."voice_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_insight_calls" ADD CONSTRAINT "agent_insight_calls_agent_insight_id_agent_insights_id_fk" FOREIGN KEY ("agent_insight_id") REFERENCES "public"."agent_insights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_insight_calls" ADD CONSTRAINT "agent_insight_calls_call_id_voice_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."voice_calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_insight_calls" ADD CONSTRAINT "agent_insight_calls_call_analysis_run_id_call_analysis_runs_id_fk" FOREIGN KEY ("call_analysis_run_id") REFERENCES "public"."call_analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_insight_calls" ADD CONSTRAINT "agent_insight_calls_criterion_result_id_criterion_results_id_fk" FOREIGN KEY ("criterion_result_id") REFERENCES "public"."criterion_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_insights" ADD CONSTRAINT "agent_insights_agent_analysis_run_id_agent_analysis_runs_id_fk" FOREIGN KEY ("agent_analysis_run_id") REFERENCES "public"."agent_analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_insights" ADD CONSTRAINT "agent_insights_criterion_version_id_success_criterion_versions_id_fk" FOREIGN KEY ("criterion_version_id") REFERENCES "public"."success_criterion_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_action_events" ADD CONSTRAINT "call_action_events_call_id_voice_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."voice_calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_analysis_runs" ADD CONSTRAINT "call_analysis_runs_call_id_voice_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."voice_calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_analysis_runs" ADD CONSTRAINT "call_analysis_runs_config_snapshot_id_agent_config_snapshots_id_fk" FOREIGN KEY ("config_snapshot_id") REFERENCES "public"."agent_config_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_analysis_runs" ADD CONSTRAINT "call_analysis_runs_criterion_set_id_criterion_sets_id_fk" FOREIGN KEY ("criterion_set_id") REFERENCES "public"."criterion_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_sentiment_summaries" ADD CONSTRAINT "call_sentiment_summaries_analysis_run_id_call_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."call_analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_turns" ADD CONSTRAINT "call_turns_call_id_voice_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."voice_calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterion_result_evidence" ADD CONSTRAINT "criterion_result_evidence_criterion_result_id_criterion_results_id_fk" FOREIGN KEY ("criterion_result_id") REFERENCES "public"."criterion_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterion_result_evidence" ADD CONSTRAINT "criterion_result_evidence_evidence_citation_id_evidence_citations_id_fk" FOREIGN KEY ("evidence_citation_id") REFERENCES "public"."evidence_citations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterion_results" ADD CONSTRAINT "criterion_results_analysis_run_id_call_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."call_analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterion_results" ADD CONSTRAINT "criterion_results_criterion_version_id_success_criterion_versions_id_fk" FOREIGN KEY ("criterion_version_id") REFERENCES "public"."success_criterion_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterion_set_members" ADD CONSTRAINT "criterion_set_members_criterion_set_id_criterion_sets_id_fk" FOREIGN KEY ("criterion_set_id") REFERENCES "public"."criterion_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterion_set_members" ADD CONSTRAINT "criterion_set_members_criterion_version_id_success_criterion_versions_id_fk" FOREIGN KEY ("criterion_version_id") REFERENCES "public"."success_criterion_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterion_sets" ADD CONSTRAINT "criterion_sets_agent_id_voice_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."voice_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_citations" ADD CONSTRAINT "evidence_citations_analysis_run_id_call_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."call_analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_citations" ADD CONSTRAINT "evidence_citations_call_turn_id_call_turns_id_fk" FOREIGN KEY ("call_turn_id") REFERENCES "public"."call_turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_evidence" ADD CONSTRAINT "finding_evidence_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_evidence" ADD CONSTRAINT "finding_evidence_evidence_citation_id_evidence_citations_id_fk" FOREIGN KEY ("evidence_citation_id") REFERENCES "public"."evidence_citations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_analysis_run_id_call_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."call_analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_criterion_result_id_criterion_results_id_fk" FOREIGN KEY ("criterion_result_id") REFERENCES "public"."criterion_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_findings" ADD CONSTRAINT "recommendation_findings_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_findings" ADD CONSTRAINT "recommendation_findings_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentiment_observations" ADD CONSTRAINT "sentiment_observations_analysis_run_id_call_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."call_analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentiment_observations" ADD CONSTRAINT "sentiment_observations_call_turn_id_call_turns_id_fk" FOREIGN KEY ("call_turn_id") REFERENCES "public"."call_turns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "success_criteria" ADD CONSTRAINT "success_criteria_agent_id_voice_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."voice_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "success_criteria" ADD CONSTRAINT "success_criteria_created_by_user_id_marketplace_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."marketplace_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "success_criterion_versions" ADD CONSTRAINT "success_criterion_versions_criterion_id_success_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."success_criteria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_agents" ADD CONSTRAINT "voice_agents_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_calls" ADD CONSTRAINT "voice_calls_agent_id_voice_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."voice_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_calls" ADD CONSTRAINT "voice_calls_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_calls" ADD CONSTRAINT "voice_calls_agent_config_snapshot_id_agent_config_snapshots_id_fk" FOREIGN KEY ("agent_config_snapshot_id") REFERENCES "public"."agent_config_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_calls" ADD CONSTRAINT "voice_calls_source_webhook_inbox_id_webhook_inbox_id_fk" FOREIGN KEY ("source_webhook_inbox_id") REFERENCES "public"."webhook_inbox"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_analysis_runs_agent_fingerprint_idx" ON "agent_analysis_runs" USING btree ("agent_id","input_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_analysis_runs_one_current_idx" ON "agent_analysis_runs" USING btree ("agent_id") WHERE "agent_analysis_runs"."is_current" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_config_snapshots_agent_hash_idx" ON "agent_config_snapshots" USING btree ("agent_id","source_hash");--> statement-breakpoint
CREATE INDEX "agent_config_snapshots_agent_valid_idx" ON "agent_config_snapshots" USING btree ("agent_id","valid_to");--> statement-breakpoint
CREATE INDEX "agent_insights_run_severity_idx" ON "agent_insights" USING btree ("agent_analysis_run_id","severity");--> statement-breakpoint
CREATE UNIQUE INDEX "call_action_events_call_ordinal_idx" ON "call_action_events" USING btree ("call_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "call_analysis_runs_call_sequence_idx" ON "call_analysis_runs" USING btree ("call_id","run_sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "call_analysis_runs_call_fingerprint_idx" ON "call_analysis_runs" USING btree ("call_id","input_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "call_analysis_runs_one_current_idx" ON "call_analysis_runs" USING btree ("call_id") WHERE "call_analysis_runs"."is_current" = true;--> statement-breakpoint
CREATE INDEX "call_analysis_runs_status_lease_idx" ON "call_analysis_runs" USING btree ("status","leased_until");--> statement-breakpoint
CREATE UNIQUE INDEX "call_turns_call_ordinal_idx" ON "call_turns" USING btree ("call_id","ordinal");--> statement-breakpoint
CREATE INDEX "call_turns_call_idx" ON "call_turns" USING btree ("call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "criterion_results_run_criterion_idx" ON "criterion_results" USING btree ("analysis_run_id","criterion_version_id");--> statement-breakpoint
CREATE INDEX "criterion_results_status_idx" ON "criterion_results" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "criterion_set_members_order_idx" ON "criterion_set_members" USING btree ("criterion_set_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "criterion_sets_agent_version_idx" ON "criterion_sets" USING btree ("agent_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "criterion_sets_agent_fingerprint_idx" ON "criterion_sets" USING btree ("agent_id","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "criterion_sets_one_active_idx" ON "criterion_sets" USING btree ("agent_id") WHERE "criterion_sets"."active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_citations_run_turn_quote_idx" ON "evidence_citations" USING btree ("analysis_run_id","call_turn_id","start_character","end_character");--> statement-breakpoint
CREATE INDEX "findings_run_severity_idx" ON "findings" USING btree ("analysis_run_id","severity");--> statement-breakpoint
CREATE UNIQUE INDEX "sentiment_observations_run_turn_idx" ON "sentiment_observations" USING btree ("analysis_run_id","call_turn_id");--> statement-breakpoint
CREATE UNIQUE INDEX "success_criteria_agent_key_idx" ON "success_criteria" USING btree ("agent_id","stable_key");--> statement-breakpoint
CREATE INDEX "success_criteria_agent_state_idx" ON "success_criteria" USING btree ("agent_id","lifecycle_state");--> statement-breakpoint
CREATE UNIQUE INDEX "success_criterion_versions_criterion_version_idx" ON "success_criterion_versions" USING btree ("criterion_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_agents_location_highlevel_idx" ON "voice_agents" USING btree ("location_id","highlevel_agent_id");--> statement-breakpoint
CREATE INDEX "voice_agents_location_state_idx" ON "voice_agents" USING btree ("location_id","lifecycle_state");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_calls_location_highlevel_idx" ON "voice_calls" USING btree ("location_id","highlevel_call_id");--> statement-breakpoint
CREATE INDEX "voice_calls_agent_created_idx" ON "voice_calls" USING btree ("agent_id","call_created_at");--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_agent_id_voice_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."voice_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_call_analysis_run_id_call_analysis_runs_id_fk" FOREIGN KEY ("call_analysis_run_id") REFERENCES "public"."call_analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_agent_analysis_run_id_agent_analysis_runs_id_fk" FOREIGN KEY ("agent_analysis_run_id") REFERENCES "public"."agent_analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_actions" ADD CONSTRAINT "user_actions_analysis_run_id_call_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."call_analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_actions" ADD CONSTRAINT "user_actions_call_id_voice_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."voice_calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_actions" ADD CONSTRAINT "user_actions_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_actions" ADD CONSTRAINT "user_actions_created_by_user_id_marketplace_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."marketplace_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recommendations_active_deduplication_idx" ON "recommendations" USING btree ("agent_id","deduplication_key") WHERE "recommendations"."status" = 'suggested';--> statement-breakpoint
CREATE INDEX "user_actions_call_status_idx" ON "user_actions" USING btree ("call_id","status");--> statement-breakpoint
CREATE INDEX "user_actions_run_idx" ON "user_actions" USING btree ("analysis_run_id");--> statement-breakpoint
CREATE INDEX "recommendations_agent_status_idx" ON "recommendations" USING btree ("agent_id","status");--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_exactly_one_scope_check" CHECK (num_nonnulls("recommendations"."call_analysis_run_id", "recommendations"."agent_analysis_run_id") = 1);--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_manual_execution_check" CHECK ("recommendations"."execution_mode" = 'manual_highlevel_ui');
