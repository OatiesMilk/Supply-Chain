-- Additive migration: no supplier text or historical audit is rewritten.
BEGIN;
ALTER TABLE "Supplier" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "SupplierCategory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "SupplierCategory_normalizedName_key" ON "SupplierCategory"("normalizedName");
CREATE TABLE "SupplierCategoryAssignment" (
  "supplierId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  CONSTRAINT "SupplierCategoryAssignment_pkey" PRIMARY KEY ("supplierId", "categoryId"),
  CONSTRAINT "SupplierCategoryAssignment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupplierCategoryAssignment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SupplierCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SupplierCategoryAssignment_categoryId_idx" ON "SupplierCategoryAssignment"("categoryId");
-- A legacy value is ONE label, even when it contains commas/semicolons. Prefer
-- the five existing display names; merge case/outer-space variants by key.
WITH labels AS (
  SELECT btrim("category") AS name, 1 AS priority FROM "Supplier" WHERE btrim("category") <> ''
  UNION ALL SELECT name, 0 FROM (VALUES ('Hardware'), ('Consumables'), ('Electronics'), ('Packaging'), ('Services')) defaults(name)
), canonical AS (
  SELECT DISTINCT ON (lower(name)) name FROM labels ORDER BY lower(name), priority, name COLLATE "C"
)
INSERT INTO "SupplierCategory" ("id", "name", "normalizedName", "updatedAt")
SELECT 'legacy-supplier-category-' || md5(lower(name)), name, lower(name), CURRENT_TIMESTAMP FROM canonical;
INSERT INTO "SupplierCategoryAssignment" ("supplierId", "categoryId")
SELECT s."id", c."id" FROM "Supplier" s JOIN "SupplierCategory" c ON c."normalizedName" = lower(btrim(s."category"));
-- Blank legacy values intentionally remain unassigned for Admin review.
COMMIT;
