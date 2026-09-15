ALTER TABLE "DeliveryRecord" ADD COLUMN "collectionVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DeliveryRecord" ADD COLUMN "collectionVerifiedBy" TEXT;
ALTER TABLE "DeliveryRecord" ADD COLUMN "collectionVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
