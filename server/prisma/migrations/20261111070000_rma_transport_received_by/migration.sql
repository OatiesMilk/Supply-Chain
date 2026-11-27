-- DeliveryRecord.rmaTransportReceivedBy: who took the items from the driver when an RMA
-- Logistics transport was completed. TASS physical receipt (rmaRecipient) stays separate.
-- Additive and nullable, no backfill. Rollback: ALTER TABLE "DeliveryRecord" DROP COLUMN "rmaTransportReceivedBy";
ALTER TABLE "DeliveryRecord" ADD COLUMN "rmaTransportReceivedBy" TEXT;
