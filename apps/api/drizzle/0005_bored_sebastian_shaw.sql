CREATE TABLE "ingestion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_key" varchar(240) NOT NULL,
	"installation_id" uuid NOT NULL,
	"location_id" uuid,
	"kind" varchar(32) NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "processed_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consumer_name" varchar(64) NOT NULL,
	"message_id" uuid NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "tenant_location_id" uuid;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "source_webhook_inbox_id" uuid;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "translation" jsonb;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "extracted_data" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "executed_call_actions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_installation_id_marketplace_app_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."marketplace_app_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_jobs_key_idx" ON "ingestion_jobs" USING btree ("job_key");--> statement-breakpoint
CREATE INDEX "ingestion_jobs_pending_idx" ON "ingestion_jobs" USING btree ("status","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "processed_messages_consumer_message_idx" ON "processed_messages" USING btree ("consumer_name","message_id");--> statement-breakpoint
CREATE INDEX "processed_messages_processed_at_idx" ON "processed_messages" USING btree ("processed_at");--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_tenant_location_id_locations_id_fk" FOREIGN KEY ("tenant_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_source_webhook_inbox_id_webhook_inbox_id_fk" FOREIGN KEY ("source_webhook_inbox_id") REFERENCES "public"."webhook_inbox"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calls_tenant_location_idx" ON "calls" USING btree ("tenant_location_id","call_created_at");