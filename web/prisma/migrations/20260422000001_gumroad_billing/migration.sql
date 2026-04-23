-- CreateEnum
CREATE TYPE "BillingProvider" AS ENUM ('gumroad');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('active', 'canceled', 'refunded', 'past_due', 'unknown');

-- CreateTable
CREATE TABLE "BillingConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "externalCustomerId" TEXT,
    "externalCustomerEmail" TEXT,
    "externalSubscriptionId" TEXT,
    "externalProductId" TEXT,
    "externalProductPermalink" TEXT,
    "status" "BillingStatus" NOT NULL DEFAULT 'unknown',
    "entitlementTier" "PlanTier" NOT NULL DEFAULT 'pro',
    "currentPeriodEnd" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "lastPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "externalEventId" TEXT,
    "eventType" TEXT NOT NULL,
    "externalCustomerId" TEXT,
    "externalCustomerEmail" TEXT,
    "externalSubscriptionId" TEXT,
    "externalProductId" TEXT,
    "externalProductPermalink" TEXT,
    "status" "BillingStatus" NOT NULL DEFAULT 'unknown',
    "processedAt" TIMESTAMP(3),
    "rawPayload" JSONB NOT NULL,
    "billingConnectionId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingConnection_userId_provider_key" ON "BillingConnection"("userId", "provider");

-- CreateIndex
CREATE INDEX "BillingConnection_provider_externalCustomerEmail_idx" ON "BillingConnection"("provider", "externalCustomerEmail");

-- CreateIndex
CREATE INDEX "BillingConnection_provider_externalSubscriptionId_idx" ON "BillingConnection"("provider", "externalSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingEvent_provider_externalEventId_key" ON "BillingEvent"("provider", "externalEventId");

-- CreateIndex
CREATE INDEX "BillingEvent_provider_externalEventId_idx" ON "BillingEvent"("provider", "externalEventId");

-- CreateIndex
CREATE INDEX "BillingEvent_provider_externalCustomerEmail_idx" ON "BillingEvent"("provider", "externalCustomerEmail");

-- CreateIndex
CREATE INDEX "BillingEvent_userId_idx" ON "BillingEvent"("userId");

-- AddForeignKey
ALTER TABLE "BillingConnection" ADD CONSTRAINT "BillingConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingEvent" ADD CONSTRAINT "BillingEvent_billingConnectionId_fkey" FOREIGN KEY ("billingConnectionId") REFERENCES "BillingConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingEvent" ADD CONSTRAINT "BillingEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
