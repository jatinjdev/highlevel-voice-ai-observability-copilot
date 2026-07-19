CREATE TABLE "metric_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"metric_key" varchar(64) NOT NULL,
	"metric_version" integer DEFAULT 1 NOT NULL,
	"dimension" varchar(48) NOT NULL,
	"assessor" varchar(24) NOT NULL,
	"applicability" varchar(24) DEFAULT 'applicable' NOT NULL,
	"level" integer,
	"normalized_score" integer,
	"passed" boolean,
	"weight" integer DEFAULT 0 NOT NULL,
	"rationale" text NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sentiment_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"initial" integer,
	"minimum" integer,
	"final" integer,
	"lift" integer,
	"recovery" integer,
	"trajectory" varchar(24) NOT NULL,
	"negative_ending" boolean DEFAULT false NOT NULL,
	"rationale" text NOT NULL,
	"turning_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "analyses_call_id_idx";--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "run_sequence" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "run_reason" varchar(32) DEFAULT 'initial' NOT NULL;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "agent_prompt_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "evidence_coverage" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "deterministic_features" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "semantic_assessment" jsonb;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "score_coverage" integer;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "analyses" SET "is_primary" = true;--> statement-breakpoint
ALTER TABLE "metric_results" ADD CONSTRAINT "metric_results_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentiment_assessments" ADD CONSTRAINT "sentiment_assessments_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "metric_results_analysis_metric_idx" ON "metric_results" USING btree ("analysis_id","metric_key","metric_version");--> statement-breakpoint
CREATE INDEX "metric_results_metric_score_idx" ON "metric_results" USING btree ("metric_key","normalized_score");--> statement-breakpoint
CREATE UNIQUE INDEX "sentiment_assessments_analysis_idx" ON "sentiment_assessments" USING btree ("analysis_id");--> statement-breakpoint
CREATE UNIQUE INDEX "analyses_call_run_idx" ON "analyses" USING btree ("call_id","run_sequence");--> statement-breakpoint
CREATE INDEX "analyses_call_primary_idx" ON "analyses" USING btree ("call_id","is_primary","completed_at");
