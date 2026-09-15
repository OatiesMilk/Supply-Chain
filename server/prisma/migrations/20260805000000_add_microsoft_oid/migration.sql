-- AlterTable
ALTER TABLE "User" ADD COLUMN "microsoftOid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_microsoftOid_key" ON "User"("microsoftOid");
