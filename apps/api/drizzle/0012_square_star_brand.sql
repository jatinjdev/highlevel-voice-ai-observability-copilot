CREATE TABLE "analysis_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_key" varchar(64) NOT NULL,
	"version" varchar(64) NOT NULL,
	"semantic_prompt_version" varchar(64) NOT NULL,
	"evaluator_version" varchar(64) NOT NULL,
	"deterministic_evaluator_version" varchar(64) NOT NULL,
	"criterion_compiler_version" varchar(64) NOT NULL,
	"recommendation_catalogue_version" varchar(48) NOT NULL,
	"output_schema_version" integer NOT NULL,
	"provider" varchar(48),
	"model" varchar(128),
	"model_parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "call_analysis_runs_call_fingerprint_idx";--> statement-breakpoint
ALTER TABLE "agent_analysis_runs" ADD COLUMN "analysis_release_id" uuid;--> statement-breakpoint
ALTER TABLE "call_analysis_runs" ADD COLUMN "analysis_release_id" uuid;--> statement-breakpoint
ALTER TABLE "call_analysis_runs" ADD COLUMN "execution_key" varchar(64);--> statement-breakpoint
INSERT INTO "analysis_releases" (
	"id",
	"release_key",
	"version",
	"semantic_prompt_version",
	"evaluator_version",
	"deterministic_evaluator_version",
	"criterion_compiler_version",
	"recommendation_catalogue_version",
	"output_schema_version",
	"model_parameters"
) VALUES (
	'00000000-0000-4000-8000-000000000017',
	'0000000000000000000000000000000000000000000000000000000000000017',
	'legacy-pre-release-identity',
	'voice-call-semantic-v1',
	'call-analyzer-v1-product-shaped',
	'deterministic-source-facts-v1',
	'success-criteria-compiler-v1',
	'2026-07-16.v1',
	1,
	'{}'::jsonb
);--> statement-breakpoint
UPDATE "agent_analysis_runs"
SET "analysis_release_id" = '00000000-0000-4000-8000-000000000017';--> statement-breakpoint
UPDATE "call_analysis_runs"
SET
	"analysis_release_id" = '00000000-0000-4000-8000-000000000017',
	"execution_key" = "input_fingerprint";--> statement-breakpoint
ALTER TABLE "agent_analysis_runs" ALTER COLUMN "analysis_release_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "call_analysis_runs" ALTER COLUMN "analysis_release_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "call_analysis_runs" ALTER COLUMN "execution_key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_releases_key_idx" ON "analysis_releases" USING btree ("release_key");--> statement-breakpoint
CREATE INDEX "analysis_releases_version_idx" ON "analysis_releases" USING btree ("version");--> statement-breakpoint
ALTER TABLE "agent_analysis_runs" ADD CONSTRAINT "agent_analysis_runs_analysis_release_id_analysis_releases_id_fk" FOREIGN KEY ("analysis_release_id") REFERENCES "public"."analysis_releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_analysis_runs" ADD CONSTRAINT "call_analysis_runs_analysis_release_id_analysis_releases_id_fk" FOREIGN KEY ("analysis_release_id") REFERENCES "public"."analysis_releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "call_analysis_runs_call_execution_idx" ON "call_analysis_runs" USING btree ("call_id","execution_key");--> statement-breakpoint
CREATE INDEX "call_analysis_runs_call_input_idx" ON "call_analysis_runs" USING btree ("call_id","input_fingerprint");
