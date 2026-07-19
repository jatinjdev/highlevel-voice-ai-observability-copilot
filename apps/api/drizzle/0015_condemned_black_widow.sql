CREATE TABLE "analysis_batch_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"request_key" varchar(160) NOT NULL,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"analysis_run_id" uuid,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analysis_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"window" varchar(16) NOT NULL,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_batch_items" ADD CONSTRAINT "analysis_batch_items_batch_id_analysis_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."analysis_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_batch_items" ADD CONSTRAINT "analysis_batch_items_call_id_voice_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."voice_calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_batch_items" ADD CONSTRAINT "analysis_batch_items_analysis_run_id_call_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "public"."call_analysis_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_batches" ADD CONSTRAINT "analysis_batches_agent_id_voice_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."voice_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_batches" ADD CONSTRAINT "analysis_batches_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_batch_items_batch_call_idx" ON "analysis_batch_items" USING btree ("batch_id","call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_batch_items_request_key_idx" ON "analysis_batch_items" USING btree ("request_key");--> statement-breakpoint
CREATE INDEX "analysis_batch_items_batch_status_idx" ON "analysis_batch_items" USING btree ("batch_id","status");--> statement-breakpoint
CREATE INDEX "analysis_batches_agent_requested_idx" ON "analysis_batches" USING btree ("agent_id","requested_at");