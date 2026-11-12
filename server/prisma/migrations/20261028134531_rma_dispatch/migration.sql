-- AlterTable
ALTER TABLE "DeliveryRecord" ADD COLUMN     "rmaCompletedAt" TIMESTAMP(3),
ADD COLUMN     "rmaMovement" TEXT,
ADD COLUMN     "rmaReceivedAt" TIMESTAMP(3),
ADD COLUMN     "rmaReceivedBy" TEXT,
ADD COLUMN     "rmaRecipient" TEXT,
ADD COLUMN     "rmaTransportCompletedAt" TIMESTAMP(3),
ADD COLUMN     "rmaTransportStartedAt" TIMESTAMP(3),
ADD COLUMN     "rmaTransportStatus" TEXT,
ADD COLUMN     "rmaVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "DeliveryRecord_category_rmaMovement_rmaTransportStatus_idx" ON "DeliveryRecord"("category", "rmaMovement", "rmaTransportStatus");

-- Historical rows remain unclassified; never invent driver responsibility.
ALTER TABLE "DeliveryRecord"
  ADD CONSTRAINT "DeliveryRecord_rmaMovement_valid" CHECK ("rmaMovement" IS NULL OR "rmaMovement" IN ('LOGISTICS_TRANSPORT', 'SUPPLIER_COLLECTION', 'INTERNAL_NO_DRIVER')),
  ADD CONSTRAINT "DeliveryRecord_rmaTransportStatus_valid" CHECK ("rmaTransportStatus" IS NULL OR "rmaTransportStatus" IN ('PENDING', 'IN_TRANSIT', 'COMPLETED')),
  ADD CONSTRAINT "DeliveryRecord_rmaVersion_nonnegative" CHECK ("rmaVersion" >= 0);
