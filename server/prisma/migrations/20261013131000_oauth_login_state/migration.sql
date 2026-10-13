CREATE TABLE "OAuthLoginState" (
  "id" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OAuthLoginState_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OAuthLoginState_expiresAt_idx" ON "OAuthLoginState"("expiresAt");
ALTER TABLE "User" ADD COLUMN "microsoftApprovedAt" TIMESTAMP(3);
