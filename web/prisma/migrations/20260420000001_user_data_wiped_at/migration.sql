-- Add a durable marker so wiped accounts can stay signed in without re-seeding starter data.
ALTER TABLE "User"
ADD COLUMN "dataWipedAt" TIMESTAMP(3);
