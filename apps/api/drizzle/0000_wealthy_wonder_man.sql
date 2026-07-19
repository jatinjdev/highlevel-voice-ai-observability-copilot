CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" varchar(64) NOT NULL,
	"highlevel_agent_id" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"prompt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid NOT NULL,
	"status" varchar(24) NOT NULL,
	"score" integer,
	"outcome" varchar(24),
	"summary" text,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" varchar(128),
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"highlevel_call_id" varchar(64) NOT NULL,
	"contact_id" varchar(64),
	"transcript" text NOT NULL,
	"summary" text,
	"duration_seconds" integer NOT NULL,
	"is_trial" boolean DEFAULT false NOT NULL,
	"call_created_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_location_highlevel_id_idx" ON "agents" USING btree ("location_id","highlevel_agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calls_highlevel_call_id_idx" ON "calls" USING btree ("highlevel_call_id");