-- Support references only: retain every original ID, message and timestamp.
-- PostgreSQL assigns existing inquiries unique numbers and owns the sequence.
ALTER TABLE "ContactInquiry" ADD COLUMN "caseNumber" SERIAL NOT NULL;
CREATE UNIQUE INDEX "ContactInquiry_caseNumber_key" ON "ContactInquiry"("caseNumber");
