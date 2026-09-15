-- Make AuditLog generic: drop FK constraint to DeliveryRecord
-- (The recordId column stays as a plain string — no FK, no ON DELETE CASCADE)
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_recordId_fkey";

-- Product master table
CREATE TABLE "Product" (
  "id"           TEXT NOT NULL,
  "skuCode"      TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "category"     TEXT NOT NULL,
  "unitCost"     DOUBLE PRECISION NOT NULL,
  "unitPrice"    DOUBLE PRECISION NOT NULL,
  "reorderPoint" INTEGER NOT NULL,
  "description"  TEXT NOT NULL DEFAULT '',
  "createdById"  TEXT NOT NULL,
  "modifiedById" TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  "deletedAt"    TIMESTAMP(3),
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Product_skuCode_key" ON "Product"("skuCode");

-- Inventory position per product (one row per SKU)
CREATE TABLE "InventoryItem" (
  "id"                TEXT NOT NULL,
  "productId"         TEXT NOT NULL,
  "warehouseLocation" TEXT NOT NULL,
  "onHandQty"         INTEGER NOT NULL DEFAULT 0,
  "allocatedQty"      INTEGER NOT NULL DEFAULT 0,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InventoryItem_productId_key" ON "InventoryItem"("productId");

-- Inventory movement transactions
CREATE TABLE "InventoryTransaction" (
  "id"               TEXT NOT NULL,
  "productId"        TEXT NOT NULL,
  "date"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "type"             TEXT NOT NULL,
  "qtyChange"        INTEGER NOT NULL,
  "resultingBalance" INTEGER NOT NULL,
  "reference"        TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- FKs for Product
ALTER TABLE "Product" ADD CONSTRAINT "Product_createdById_fkey"  FOREIGN KEY ("createdById")  REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_modifiedById_fkey" FOREIGN KEY ("modifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FKs for InventoryItem
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FKs for InventoryTransaction
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
