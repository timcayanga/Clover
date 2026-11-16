-- AlterTable
ALTER TABLE "BillingSubscription" ADD COLUMN     "paidThrough" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProAccessGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'admin',
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "rewardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthCampaign" (
    "id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "rules" JSONB NOT NULL,
    "terms" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCheckout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "campaignId" TEXT,
    "referrerId" TEXT,
    "code" TEXT,
    "rules" JSONB NOT NULL,
    "terms" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthPayment" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "userId" TEXT,
    "checkoutId" TEXT,
    "amount" TEXT,
    "currency" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidThrough" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowthPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralReward" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "availableAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowthAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProAccessGrant_rewardId_key" ON "ProAccessGrant"("rewardId");

-- CreateIndex
CREATE INDEX "ProAccessGrant_userId_endsAt_idx" ON "ProAccessGrant"("userId", "endsAt");

-- CreateIndex
CREATE INDEX "GrowthCampaign_environment_status_endsAt_idx" ON "GrowthCampaign"("environment", "status", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_userId_campaignId_key" ON "ReferralCode"("userId", "campaignId");

-- CreateIndex
CREATE INDEX "ReferralCheckout_userId_createdAt_idx" ON "ReferralCheckout"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GrowthPayment_userId_paidAt_idx" ON "GrowthPayment"("userId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_referredId_key" ON "ReferralReward"("referredId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_paymentId_key" ON "ReferralReward"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_checkoutId_key" ON "ReferralReward"("checkoutId");

-- CreateIndex
CREATE INDEX "ReferralReward_referrerId_status_idx" ON "ReferralReward"("referrerId", "status");

-- CreateIndex
CREATE INDEX "ReferralReward_campaignId_status_idx" ON "ReferralReward"("campaignId", "status");

-- CreateIndex
CREATE INDEX "GrowthAudit_targetId_createdAt_idx" ON "GrowthAudit"("targetId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProAccessGrant" ADD CONSTRAINT "ProAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "GrowthCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProAccessGrant" ADD CONSTRAINT "ProAccessGrant_dates_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE "GrowthCampaign" ADD CONSTRAINT "GrowthCampaign_dates_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_months_check" CHECK ("months" BETWEEN 1 AND 12);
-- Access is exclusively through Clover's authenticated, environment-scoped server routes.
ALTER TABLE "ProAccessGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GrowthCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReferralCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReferralCheckout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GrowthPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReferralReward" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GrowthAudit" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "ProAccessGrant", "GrowthCampaign", "ReferralCode", "ReferralCheckout", "GrowthPayment", "ReferralReward", "GrowthAudit" FROM PUBLIC, anon, authenticated, service_role;
