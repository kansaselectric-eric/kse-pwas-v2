-- Add capital plan / CIP intel store (Kansas + early signals)
CREATE TABLE IF NOT EXISTS "CapitalPlanItem" (
  "id" TEXT PRIMARY KEY,
  "hash" TEXT UNIQUE,
  "source" TEXT NOT NULL,
  "sourceType" TEXT,
  "agency" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "url" TEXT,
  "docUrl" TEXT,
  "city" TEXT,
  "state" TEXT,
  "county" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "fiscalYear" TEXT,
  "budget" DOUBLE PRECISION,
  "status" TEXT,
  "stage" TEXT,
  "tags" JSONB,
  "publishedAt" TEXT,
  "scrapedAt" TEXT,
  "createdAt" TEXT,
  "updatedAt" TEXT,
  "raw" JSONB
);

CREATE INDEX IF NOT EXISTS "CapitalPlanItem_state_idx" ON "CapitalPlanItem" ("state");
CREATE INDEX IF NOT EXISTS "CapitalPlanItem_city_idx" ON "CapitalPlanItem" ("city");
CREATE INDEX IF NOT EXISTS "CapitalPlanItem_source_idx" ON "CapitalPlanItem" ("source");
CREATE INDEX IF NOT EXISTS "CapitalPlanItem_publishedAt_idx" ON "CapitalPlanItem" ("publishedAt");

