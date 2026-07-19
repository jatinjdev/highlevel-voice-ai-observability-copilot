DROP INDEX "message_outbox_unpublished_idx";--> statement-breakpoint
ALTER TABLE "message_outbox" ADD COLUMN "next_publish_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "message_outbox" ADD COLUMN "lease_token" uuid;--> statement-breakpoint
ALTER TABLE "message_outbox" ADD COLUMN "leased_until" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "message_outbox_unpublished_idx" ON "message_outbox" USING btree ("published_at","next_publish_at","leased_until");