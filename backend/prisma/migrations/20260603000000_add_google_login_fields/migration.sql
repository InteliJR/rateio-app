ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;

ALTER TABLE "users"
ADD COLUMN "googleId" TEXT,
ADD COLUMN "googleAvatarUrl" TEXT,
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");
