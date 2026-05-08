-- Add a durable favorite flag for accounts so mobile can surface starred cards.
ALTER TABLE "Account"
ADD COLUMN "favorite" BOOLEAN NOT NULL DEFAULT false;
