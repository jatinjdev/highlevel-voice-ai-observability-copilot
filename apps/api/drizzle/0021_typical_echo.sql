DROP TABLE "analysis_batch_items" CASCADE;--> statement-breakpoint
DROP TABLE "analysis_batches" CASCADE;--> statement-breakpoint
DROP TABLE "ingestion_jobs" CASCADE;--> statement-breakpoint
DROP TABLE "installation_location_grants" CASCADE;--> statement-breakpoint
DROP TABLE "marketplace_app_installations" CASCADE;--> statement-breakpoint
ALTER TABLE "voice_agents" ADD COLUMN "source" varchar(24) DEFAULT 'highlevel' NOT NULL;