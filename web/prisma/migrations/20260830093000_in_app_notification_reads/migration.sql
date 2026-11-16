CREATE TABLE "InAppNotificationRead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InAppNotificationRead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InAppNotificationRead_userId_notificationKey_key"
ON "InAppNotificationRead"("userId", "notificationKey");

CREATE INDEX "InAppNotificationRead_userId_readAt_idx"
ON "InAppNotificationRead"("userId", "readAt");

ALTER TABLE "InAppNotificationRead"
ADD CONSTRAINT "InAppNotificationRead_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
