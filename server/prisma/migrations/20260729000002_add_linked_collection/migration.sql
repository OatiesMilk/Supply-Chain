-- AlterTable
ALTER TABLE "DeliveryRecord" ADD COLUMN "linkedCollectionId" TEXT;

-- AddForeignKey
ALTER TABLE "DeliveryRecord" ADD CONSTRAINT "DeliveryRecord_linkedCollectionId_fkey" FOREIGN KEY ("linkedCollectionId") REFERENCES "DeliveryRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
