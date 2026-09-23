/*
  Warnings:

  - You are about to drop the column `createdBy` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `modifiedBy` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `createdBy` on the `Supplier` table. All the data in the column will be lost.
  - You are about to drop the column `modifiedBy` on the `Supplier` table. All the data in the column will be lost.
  - Added the required column `createdById` to the `Customer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `modifiedById` to the `Customer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `createdById` to the `Supplier` table without a default value. This is not possible if the table is not empty.
  - Added the required column `modifiedById` to the `Supplier` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "createdBy",
DROP COLUMN "modifiedBy",
ADD COLUMN     "createdById" TEXT NOT NULL,
ADD COLUMN     "modifiedById" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Supplier" DROP COLUMN "createdBy",
DROP COLUMN "modifiedBy",
ADD COLUMN     "createdById" TEXT NOT NULL,
ADD COLUMN     "modifiedById" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_modifiedById_fkey" FOREIGN KEY ("modifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_modifiedById_fkey" FOREIGN KEY ("modifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
