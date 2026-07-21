DELETE FROM "agent_recommendations";--> statement-breakpoint
DELETE FROM "recommendation_generation_states";--> statement-breakpoint
ALTER TABLE "agent_recommendations" ALTER COLUMN "prompt_addition" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_recommendations" ADD COLUMN "capability_id" varchar(96) NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_recommendations" ADD COLUMN "capability_label" varchar(48) NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_recommendations" ADD COLUMN "ui_path" text NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_recommendations" ADD COLUMN "advice" text NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_recommendations" ADD COLUMN "prompt_remove" text;--> statement-breakpoint
ALTER TABLE "agent_recommendations" ADD COLUMN "configuration_hash" varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_agent_configurations" ADD COLUMN "configuration_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "agent_recommendations" DROP COLUMN "prompt_hash";
