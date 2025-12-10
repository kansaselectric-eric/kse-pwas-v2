-- Add optional opportunity link to activities
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "opportunityId" TEXT;

