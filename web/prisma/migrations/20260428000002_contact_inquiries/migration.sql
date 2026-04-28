CREATE TYPE "ContactInquiryStatus" AS ENUM ('open', 'in_progress', 'responded', 'closed');

CREATE TABLE "ContactInquiry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sourcePage" TEXT,
    "userAgent" TEXT,
    "status" "ContactInquiryStatus" NOT NULL DEFAULT 'open',
    "adminReplySubject" TEXT,
    "adminReplyBody" TEXT,
    "adminReplyAt" TIMESTAMP(3),
    "adminReplyBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactInquiry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactInquiry_status_idx" ON "ContactInquiry"("status");
CREATE INDEX "ContactInquiry_createdAt_idx" ON "ContactInquiry"("createdAt");
CREATE INDEX "ContactInquiry_email_idx" ON "ContactInquiry"("email");
