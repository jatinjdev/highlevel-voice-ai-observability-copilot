CREATE TABLE "agent_aggregation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"analysis_release_id" uuid NOT NULL,
	"criterion_set_id" uuid NOT NULL,
	"requested_revision" integer DEFAULT 1 NOT NULL,
	"processed_revision" integer DEFAULT 0 NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"lease_token" uuid,
	"leased_until" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_aggregation_jobs" ADD CONSTRAINT "agent_aggregation_jobs_agent_id_voice_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."voice_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_aggregation_jobs" ADD CONSTRAINT "agent_aggregation_jobs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_aggregation_jobs" ADD CONSTRAINT "agent_aggregation_jobs_analysis_release_id_analysis_releases_id_fk" FOREIGN KEY ("analysis_release_id") REFERENCES "public"."analysis_releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_aggregation_jobs" ADD CONSTRAINT "agent_aggregation_jobs_criterion_set_id_criterion_sets_id_fk" FOREIGN KEY ("criterion_set_id") REFERENCES "public"."criterion_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_aggregation_jobs_agent_idx" ON "agent_aggregation_jobs" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_aggregation_jobs_pending_idx" ON "agent_aggregation_jobs" USING btree ("status","requested_at");