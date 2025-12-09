-- Add notes field to Opportunity for project/account notes
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "notes" TEXT;

