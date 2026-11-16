CREATE TABLE "InAppNotificationDismissal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationKey" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InAppNotificationDismissal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InAppNotificationDismissal_userId_notificationKey_key"
ON "InAppNotificationDismissal"("userId", "notificationKey");

CREATE INDEX "InAppNotificationDismissal_userId_dismissedAt_idx"
ON "InAppNotificationDismissal"("userId", "dismissedAt");

ALTER TABLE "InAppNotificationDismissal"
ADD CONSTRAINT "InAppNotificationDismissal_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
