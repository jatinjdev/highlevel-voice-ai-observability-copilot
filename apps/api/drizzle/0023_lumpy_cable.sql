ALTER TABLE "agent_recommendations" RENAME COLUMN "prompt_remove" TO "prompt_removals";
ALTER TABLE "agent_recommendations"
  ALTER COLUMN "prompt_removals" TYPE text[]
  USING CASE
    WHEN "prompt_removals" IS NULL THEN ARRAY[]::text[]
    ELSE ARRAY["prompt_removals"]::text[]
  END;
ALTER TABLE "agent_recommendations"
  ALTER COLUMN "prompt_removals" SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN "prompt_removals" SET NOT NULL;
