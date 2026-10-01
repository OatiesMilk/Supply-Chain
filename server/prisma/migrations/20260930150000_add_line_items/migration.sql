-- CreateTable
CREATE TABLE "LineItem" (
    "id" TEXT NOT NULL,
    "deliveryRecordId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LineItem_deliveryRecordId_idx" ON "LineItem"("deliveryRecordId");

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_deliveryRecordId_fkey" FOREIGN KEY ("deliveryRecordId") REFERENCES "DeliveryRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
