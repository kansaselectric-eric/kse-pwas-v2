-- Add contactName to Activity for ad-hoc contact logging
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "contactName" TEXT;

