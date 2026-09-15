CREATE TABLE "Customer" (
  "id"           TEXT NOT NULL PRIMARY KEY,
  "name"         TEXT NOT NULL,
  "contactPerson" TEXT NOT NULL,
  "email"        TEXT NOT NULL,
  "phone"        TEXT NOT NULL,
  "address"      TEXT NOT NULL,
  "city"         TEXT NOT NULL,
  "createdBy"    TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "modifiedBy"   TEXT NOT NULL,
  "modifiedAt"   TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Supplier" (
  "id"           TEXT NOT NULL PRIMARY KEY,
  "name"         TEXT NOT NULL,
  "contactPerson" TEXT NOT NULL,
  "email"        TEXT NOT NULL,
  "phone"        TEXT NOT NULL,
  "address"      TEXT NOT NULL,
  "city"         TEXT NOT NULL,
  "category"     TEXT NOT NULL,
  "createdBy"    TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "modifiedBy"   TEXT NOT NULL,
  "modifiedAt"   TIMESTAMP(3) NOT NULL
);
