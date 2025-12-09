-- Add contact reference to opportunities
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "contactId" TEXT;
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "contactName" TEXT;

