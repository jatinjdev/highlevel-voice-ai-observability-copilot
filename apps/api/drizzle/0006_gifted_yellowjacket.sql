CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"rubric_id" uuid NOT NULL,
	"source_analysis_id" uuid NOT NULL,
	"title" text NOT NULL,
	"rationale" text NOT NULL,
	"proposed_change" text NOT NULL,
	"finding_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cohort_call_count" integer DEFAULT 1 NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"source_prompt_hash" varchar(64) NOT NULL,
	"definition" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "use_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"kind" varchar(32) NOT NULL,
	"title" text NOT NULL,
	"rationale" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"status" varchar(24) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "rubric_id" uuid;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "evaluator_version" varchar(48);--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "confidence" integer;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "lease_token" uuid;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "leased_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_rubric_id_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."rubrics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_source_analysis_id_analyses_id_fk" FOREIGN KEY ("source_analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubrics" ADD CONSTRAINT "rubrics_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "use_actions" ADD CONSTRAINT "use_actions_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "use_actions" ADD CONSTRAINT "use_actions_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recommendations_agent_status_idx" ON "recommendations" USING btree ("agent_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rubrics_agent_version_idx" ON "rubrics" USING btree ("agent_id","version");--> statement-breakpoint
CREATE INDEX "rubrics_agent_active_idx" ON "rubrics" USING btree ("agent_id","active");--> statement-breakpoint
CREATE INDEX "use_actions_status_idx" ON "use_actions" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_rubric_id_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."rubrics"("id") ON DELETE restrict ON UPDATE no action;