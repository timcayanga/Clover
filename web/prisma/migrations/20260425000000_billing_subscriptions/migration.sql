-- Create billing enums.
CREATE TYPE "BillingProvider" AS ENUM ('paypal');

CREATE TYPE "BillingInterval" AS ENUM ('monthly', 'annual');

CREATE TYPE "BillingSubscriptionStatus" AS ENUM ('approval_pending', 'active', 'cancelled', 'suspended', 'expired', 'unknown');

-- Create billing tables.
CREATE TABLE "BillingSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL DEFAULT 'paypal',
    "providerSubscriptionId" TEXT,
    "providerPlanId" TEXT,
    "status" "BillingSubscriptionStatus" NOT NULL DEFAULT 'unknown',
    "planTier" "PlanTier" NOT NULL DEFAULT 'free',
    "interval" "BillingInterval",
    "pendingPlanId" TEXT,
    "pendingInterval" "BillingInterval",
    "currentPeriodEnd" TIMESTAMP(3),
    "nextBillingTime" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "lastEventType" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingSubscription_userId_key" ON "BillingSubscription"("userId");
CREATE UNIQUE INDEX "BillingSubscription_providerSubscriptionId_key" ON "BillingSubscription"("providerSubscriptionId");
CREATE INDEX "BillingSubscription_providerPlanId_idx" ON "BillingSubscription"("providerPlanId");
CREATE INDEX "BillingSubscription_status_idx" ON "BillingSubscription"("status");

ALTER TABLE "BillingSubscription"
ADD CONSTRAINT "BillingSubscription_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL DEFAULT 'paypal',
    "providerEventId" TEXT,
    "eventType" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "userId" TEXT,
    "status" TEXT,
    "rawPayload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingEvent_providerEventId_key" ON "BillingEvent"("providerEventId");
CREATE INDEX "BillingEvent_subscriptionId_idx" ON "BillingEvent"("subscriptionId");
CREATE INDEX "BillingEvent_userId_idx" ON "BillingEvent"("userId");
CREATE INDEX "BillingEvent_eventType_idx" ON "BillingEvent"("eventType");

ALTER TABLE "BillingEvent"
ADD CONSTRAINT "BillingEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
