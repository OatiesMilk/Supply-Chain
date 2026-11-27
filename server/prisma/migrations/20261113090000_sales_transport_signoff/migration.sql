-- Sales Coordinator sign-off for driver transport handoffs.
-- Additive: existing ACCOMPLISHED rows remain final and keep their existing basis.
BEGIN;

ALTER TABLE "DeliveryRecord"
  ADD COLUMN "completionSignedOffById" TEXT,
  ADD COLUMN "completionSignedOffAt" TIMESTAMP(3),
  ADD COLUMN "completionRemarks" TEXT,
  ADD COLUMN "completionReviewedPhotoId" TEXT;

ALTER TABLE "DeliveryRecord"
  ADD CONSTRAINT "DeliveryRecord_completionSignedOffById_fkey"
  FOREIGN KEY ("completionSignedOffById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "DeliveryRecord_category_status_completionSignedOffAt_idx"
  ON "DeliveryRecord"("category", "status", "completionSignedOffAt");

COMMIT;
