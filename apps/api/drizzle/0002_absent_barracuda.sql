CREATE TABLE "marketplace_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" varchar(64) NOT NULL,
	"company_id" varchar(64),
	"user_id" varchar(64) NOT NULL,
	"user_type" varchar(24) NOT NULL,
	"token_type" varchar(24) DEFAULT 'Bearer' NOT NULL,
	"encrypted_access_token" text NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"access_token_expires_at" timestamp with time zone NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_refreshed_at" timestamp with time zone,
	"uninstalled_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_installations_location_id_idx" ON "marketplace_installations" USING btree ("location_id");