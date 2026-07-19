ALTER TABLE "use_actions" RENAME TO "user_actions";--> statement-breakpoint
ALTER TABLE "user_actions" DROP CONSTRAINT "use_actions_analysis_id_analyses_id_fk";
--> statement-breakpoint
ALTER TABLE "user_actions" DROP CONSTRAINT "use_actions_call_id_calls_id_fk";
--> statement-breakpoint
DROP INDEX "use_actions_status_idx";--> statement-breakpoint
ALTER TABLE "user_actions" ADD CONSTRAINT "user_actions_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_actions" ADD CONSTRAINT "user_actions_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_actions_status_idx" ON "user_actions" USING btree ("status","created_at");