CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"highlevel_company_id" varchar(64) NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installation_location_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"highlevel_location_id" varchar(64) NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_app_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_key" varchar(196) NOT NULL,
	"app_id" varchar(64) NOT NULL,
	"subject_type" varchar(24) NOT NULL,
	"subject_external_id" varchar(64) NOT NULL,
	"company_id" uuid,
	"installer_user_id" varchar(64),
	"status" varchar(24) DEFAULT 'provisional' NOT NULL,
	"installed_at" timestamp with time zone,
	"uninstalled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_inbox_id" uuid NOT NULL,
	"event_type" varchar(96) NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"aggregate_type" varchar(48) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"causation_id" uuid,
	"company_id" uuid,
	"location_id" uuid,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"publish_attempts" integer DEFAULT 0 NOT NULL,
	"last_publish_error" text
);
--> statement-breakpoint
CREATE TABLE "webhook_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"app_id" varchar(64),
	"webhook_id" varchar(128),
	"event_type" varchar(64) NOT NULL,
	"payload_sha256" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(24) DEFAULT 'received' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "installation_location_grants" ADD CONSTRAINT "installation_location_grants_installation_id_marketplace_app_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."marketplace_app_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installation_location_grants" ADD CONSTRAINT "installation_location_grants_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_app_installations" ADD CONSTRAINT "marketplace_app_installations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_outbox" ADD CONSTRAINT "message_outbox_source_inbox_id_webhook_inbox_id_fk" FOREIGN KEY ("source_inbox_id") REFERENCES "public"."webhook_inbox"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_outbox" ADD CONSTRAINT "message_outbox_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_outbox" ADD CONSTRAINT "message_outbox_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_highlevel_id_idx" ON "companies" USING btree ("highlevel_company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "installation_location_grants_installation_location_idx" ON "installation_location_grants" USING btree ("installation_id","location_id");--> statement-breakpoint
CREATE INDEX "installation_location_grants_location_idx" ON "installation_location_grants" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_highlevel_id_idx" ON "locations" USING btree ("highlevel_location_id");--> statement-breakpoint
CREATE INDEX "locations_company_id_idx" ON "locations" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_app_installations_key_idx" ON "marketplace_app_installations" USING btree ("installation_key");--> statement-breakpoint
CREATE INDEX "marketplace_app_installations_company_idx" ON "marketplace_app_installations" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_outbox_source_event_idx" ON "message_outbox" USING btree ("source_inbox_id","event_type");--> statement-breakpoint
CREATE INDEX "message_outbox_unpublished_idx" ON "message_outbox" USING btree ("published_at","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_inbox_idempotency_key_idx" ON "webhook_inbox" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "webhook_inbox_event_type_idx" ON "webhook_inbox" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "webhook_inbox_received_at_idx" ON "webhook_inbox" USING btree ("received_at");