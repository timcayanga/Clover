CREATE TYPE "CircleType" AS ENUM ('household', 'couple', 'family', 'travel', 'friends', 'goal', 'custom');
CREATE TYPE "CircleRole" AS ENUM ('organizer', 'member', 'participant');
CREATE TYPE "CircleMemberStatus" AS ENUM ('invited', 'active', 'left', 'removed');
CREATE TYPE "CircleInvitationStatus" AS ENUM ('pending', 'accepted', 'revoked', 'expired');
CREATE TYPE "CircleVisibility" AS ENUM ('summary', 'item', 'circle_owned');
CREATE TYPE "CircleGoalStatus" AS ENUM ('active', 'paused', 'completed', 'archived');

CREATE TABLE "Circle" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CircleType" NOT NULL DEFAULT 'custom',
    "description" TEXT,
    "avatarUrl" TEXT,
    "color" TEXT NOT NULL DEFAULT 'teal',
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "Circle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CircleMembership" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "role" "CircleRole" NOT NULL DEFAULT 'member',
    "status" "CircleMemberStatus" NOT NULL DEFAULT 'active',
    "contributionTarget" DECIMAL(18,2),
    "contributionCadence" "BudgetCadence" NOT NULL DEFAULT 'monthly',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    CONSTRAINT "CircleMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CircleInvitation" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "role" "CircleRole" NOT NULL DEFAULT 'member',
    "status" "CircleInvitationStatus" NOT NULL DEFAULT 'pending',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CircleInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CircleActivity" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CircleActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CircleBudget" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "cadence" "BudgetCadence" NOT NULL DEFAULT 'monthly',
    "categoryName" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CircleBudget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CircleGoal" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT,
    "targetAmount" DECIMAL(18,2) NOT NULL,
    "startingAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "targetDate" TIMESTAMP(3),
    "status" "CircleGoalStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CircleGoal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CircleCommitment" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "assignedMemberId" TEXT,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "recurrence" "CommitmentRecurrence" NOT NULL DEFAULT 'monthly',
    "nextDueDate" TIMESTAMP(3),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CircleCommitment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CircleContribution" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "memberId" TEXT,
    "goalId" TEXT,
    "contributedByUserId" TEXT,
    "sourceTransactionId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "contributionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CircleContribution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CircleSharedTransaction" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "sharedByUserId" TEXT NOT NULL,
    "visibility" "CircleVisibility" NOT NULL DEFAULT 'item',
    "sharedAmount" DECIMAL(18,2),
    "sharedTitle" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CircleSharedTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CircleInvestmentShare" (
    "id" TEXT NOT NULL,
    "circleId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sharedByUserId" TEXT NOT NULL,
    "visibility" "CircleVisibility" NOT NULL DEFAULT 'summary',
    "includeHoldings" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CircleInvestmentShare_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SplitBillGroup" ADD COLUMN "circleId" TEXT;

CREATE UNIQUE INDEX "CircleInvitation_token_key" ON "CircleInvitation"("token");
CREATE UNIQUE INDEX "CircleMembership_circleId_userId_key" ON "CircleMembership"("circleId", "userId");
CREATE UNIQUE INDEX "CircleSharedTransaction_circleId_transactionId_key" ON "CircleSharedTransaction"("circleId", "transactionId");
CREATE UNIQUE INDEX "CircleInvestmentShare_circleId_accountId_key" ON "CircleInvestmentShare"("circleId", "accountId");
CREATE UNIQUE INDEX "SplitBillGroup_circleId_key" ON "SplitBillGroup"("circleId");

CREATE INDEX "Circle_ownerUserId_idx" ON "Circle"("ownerUserId");
CREATE INDEX "Circle_archivedAt_idx" ON "Circle"("archivedAt");
CREATE INDEX "Circle_type_idx" ON "Circle"("type");
CREATE INDEX "CircleMembership_circleId_status_idx" ON "CircleMembership"("circleId", "status");
CREATE INDEX "CircleMembership_userId_status_idx" ON "CircleMembership"("userId", "status");
CREATE INDEX "CircleMembership_email_idx" ON "CircleMembership"("email");
CREATE INDEX "CircleInvitation_circleId_status_idx" ON "CircleInvitation"("circleId", "status");
CREATE INDEX "CircleInvitation_email_status_idx" ON "CircleInvitation"("email", "status");
CREATE INDEX "CircleInvitation_expiresAt_idx" ON "CircleInvitation"("expiresAt");
CREATE INDEX "CircleActivity_circleId_createdAt_idx" ON "CircleActivity"("circleId", "createdAt");
CREATE INDEX "CircleActivity_actorUserId_idx" ON "CircleActivity"("actorUserId");
CREATE INDEX "CircleActivity_entityType_entityId_idx" ON "CircleActivity"("entityType", "entityId");
CREATE INDEX "CircleBudget_circleId_isActive_idx" ON "CircleBudget"("circleId", "isActive");
CREATE INDEX "CircleGoal_circleId_status_idx" ON "CircleGoal"("circleId", "status");
CREATE INDEX "CircleGoal_targetDate_idx" ON "CircleGoal"("targetDate");
CREATE INDEX "CircleCommitment_circleId_isActive_idx" ON "CircleCommitment"("circleId", "isActive");
CREATE INDEX "CircleCommitment_assignedMemberId_idx" ON "CircleCommitment"("assignedMemberId");
CREATE INDEX "CircleCommitment_nextDueDate_idx" ON "CircleCommitment"("nextDueDate");
CREATE INDEX "CircleContribution_circleId_contributionDate_idx" ON "CircleContribution"("circleId", "contributionDate");
CREATE INDEX "CircleContribution_memberId_idx" ON "CircleContribution"("memberId");
CREATE INDEX "CircleContribution_goalId_idx" ON "CircleContribution"("goalId");
CREATE INDEX "CircleContribution_contributedByUserId_idx" ON "CircleContribution"("contributedByUserId");
CREATE INDEX "CircleContribution_sourceTransactionId_idx" ON "CircleContribution"("sourceTransactionId");
CREATE INDEX "CircleSharedTransaction_circleId_createdAt_idx" ON "CircleSharedTransaction"("circleId", "createdAt");
CREATE INDEX "CircleSharedTransaction_sharedByUserId_idx" ON "CircleSharedTransaction"("sharedByUserId");
CREATE INDEX "CircleInvestmentShare_circleId_createdAt_idx" ON "CircleInvestmentShare"("circleId", "createdAt");
CREATE INDEX "CircleInvestmentShare_sharedByUserId_idx" ON "CircleInvestmentShare"("sharedByUserId");
CREATE INDEX "SplitBillGroup_circleId_idx" ON "SplitBillGroup"("circleId");

ALTER TABLE "Circle" ADD CONSTRAINT "Circle_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CircleMembership" ADD CONSTRAINT "CircleMembership_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CircleMembership" ADD CONSTRAINT "CircleMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CircleInvitation" ADD CONSTRAINT "CircleInvitation_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CircleInvitation" ADD CONSTRAINT "CircleInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CircleActivity" ADD CONSTRAINT "CircleActivity_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CircleActivity" ADD CONSTRAINT "CircleActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CircleBudget" ADD CONSTRAINT "CircleBudget_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CircleGoal" ADD CONSTRAINT "CircleGoal_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CircleCommitment" ADD CONSTRAINT "CircleCommitment_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CircleCommitment" ADD CONSTRAINT "CircleCommitment_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "CircleMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CircleContribution" ADD CONSTRAINT "CircleContribution_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CircleContribution" ADD CONSTRAINT "CircleContribution_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CircleMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CircleContribution" ADD CONSTRAINT "CircleContribution_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "CircleGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CircleContribution" ADD CONSTRAINT "CircleContribution_contributedByUserId_fkey" FOREIGN KEY ("contributedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CircleContribution" ADD CONSTRAINT "CircleContribution_sourceTransactionId_fkey" FOREIGN KEY ("sourceTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CircleSharedTransaction" ADD CONSTRAINT "CircleSharedTransaction_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CircleSharedTransaction" ADD CONSTRAINT "CircleSharedTransaction_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CircleSharedTransaction" ADD CONSTRAINT "CircleSharedTransaction_sharedByUserId_fkey" FOREIGN KEY ("sharedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CircleInvestmentShare" ADD CONSTRAINT "CircleInvestmentShare_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CircleInvestmentShare" ADD CONSTRAINT "CircleInvestmentShare_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CircleInvestmentShare" ADD CONSTRAINT "CircleInvestmentShare_sharedByUserId_fkey" FOREIGN KEY ("sharedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SplitBillGroup" ADD CONSTRAINT "SplitBillGroup_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "Circle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Circle" ("id", "ownerUserId", "name", "type", "avatarUrl", "currency", "createdAt", "updatedAt", "archivedAt")
SELECT g."id", g."userId", g."name", 'custom'::"CircleType", g."avatarUrl", COALESCE((SELECT b."currency" FROM "SplitBill" b WHERE b."groupId" = g."id" ORDER BY b."updatedAt" DESC LIMIT 1), 'PHP'), g."createdAt", g."updatedAt", g."archivedAt"
FROM "SplitBillGroup" g;

UPDATE "SplitBillGroup" SET "circleId" = "id";

INSERT INTO "CircleMembership" ("id", "circleId", "userId", "displayName", "email", "role", "status", "createdAt", "updatedAt", "joinedAt")
SELECT g."id" || ':owner', g."id", u."id", COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u."firstName", u."lastName")), ''), u."email"), u."email", 'organizer'::"CircleRole", 'active'::"CircleMemberStatus", g."createdAt", g."updatedAt", g."createdAt"
FROM "SplitBillGroup" g
JOIN "User" u ON u."id" = g."userId";

INSERT INTO "CircleMembership" ("id", "circleId", "userId", "displayName", "email", "role", "status", "createdAt", "updatedAt", "joinedAt")
SELECT c."id", c."groupId", u."id", COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u."firstName", u."lastName")), ''), u."email"), u."email", 'member'::"CircleRole", 'active'::"CircleMemberStatus", c."createdAt", c."createdAt", c."createdAt"
FROM "SplitBillGroupCollaborator" c
JOIN "User" u ON u."id" = c."userId"
ON CONFLICT ("circleId", "userId") DO NOTHING;

INSERT INTO "CircleMembership" ("id", "circleId", "displayName", "role", "status", "createdAt", "updatedAt")
SELECT m."id", m."groupId", m."name", 'participant'::"CircleRole", 'invited'::"CircleMemberStatus", m."createdAt", m."updatedAt"
FROM "SplitBillGroupMember" m;

INSERT INTO "CircleInvitation" ("id", "circleId", "invitedByUserId", "role", "status", "token", "expiresAt", "createdAt", "updatedAt")
SELECT g."id" || ':legacy-invite', g."id", g."userId", 'member'::"CircleRole", 'pending'::"CircleInvitationStatus", g."shareToken", CURRENT_TIMESTAMP + INTERVAL '365 days', g."createdAt", g."updatedAt"
FROM "SplitBillGroup" g
WHERE g."shareToken" IS NOT NULL;

INSERT INTO "CircleActivity" ("id", "circleId", "actorUserId", "action", "entityType", "entityId", "summary", "createdAt")
SELECT g."id" || ':migrated', g."id", g."userId", 'circle_migrated', 'circle', g."id", 'Existing Split Bills group upgraded to a Circle.', CURRENT_TIMESTAMP
FROM "SplitBillGroup" g;
