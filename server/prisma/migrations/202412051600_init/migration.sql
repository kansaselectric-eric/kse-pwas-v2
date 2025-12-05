-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "city" TEXT,
    "state" TEXT,
    "annualPotential" DOUBLE PRECISION,
    "projectedValue" DOUBLE PRECISION,
    "entrenchment" TEXT,
    "stage" TEXT,
    "relationshipHealth" TEXT,
    "nextStep" TEXT,
    "notes" TEXT,
    "lastContact" TEXT,
    "createdAt" TEXT,
    "updatedAt" TEXT,
    "stalled" BOOLEAN DEFAULT false,
    "ownerId" TEXT,
    "ownerName" TEXT,
    "ownerEmail" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "updatedById" TEXT,
    "updatedByName" TEXT,
    "score" INTEGER,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "accountId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "segment" TEXT,
    "location" TEXT,
    "influence" INTEGER,
    "createdAt" TEXT,
    "updatedAt" TEXT,
    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "accountId" TEXT,
    "contactId" TEXT,
    "type" TEXT,
    "channel" TEXT,
    "subject" TEXT,
    "notes" TEXT,
    "tags" JSONB,
    "nextFollowUp" TEXT,
    "outcome" TEXT,
    "sentimentScore" INTEGER,
    "duration" INTEGER,
    "date" TEXT,
    "files" JSONB,
    "aiConfidence" DOUBLE PRECISION,
    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movement" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "accountId" TEXT,
    "opportunityId" TEXT,
    "context" TEXT,
    "oldStage" TEXT,
    "newStage" TEXT,
    "movementType" TEXT,
    "notes" TEXT,
    "date" TEXT,
    CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "accountId" TEXT,
    "type" TEXT,
    "description" TEXT,
    "value" DOUBLE PRECISION,
    "status" TEXT,
    "stage" TEXT,
    "createdAt" TEXT,
    "updatedAt" TEXT,
    "projectName" TEXT,
    "ecdStageKey" TEXT,
    "ecdStageLabel" TEXT,
    "bidStatus" TEXT,
    "bidDueDate" TEXT,
    "budgetaryOnly" BOOLEAN DEFAULT false,
    "assignedEstimator" TEXT,
    "gcList" JSONB,
    "projectAddress" TEXT,
    "projectCity" TEXT,
    "projectState" TEXT,
    "projectLat" TEXT,
    "projectLng" TEXT,
    "projectLocationAccuracy" TEXT,
    "lastStageChange" TEXT,
    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

