-- Add Time In, Time Out, and Received By fields to DeliveryRecord
ALTER TABLE "DeliveryRecord" ADD COLUMN "timeIn" TEXT;
ALTER TABLE "DeliveryRecord" ADD COLUMN "timeOut" TEXT;
ALTER TABLE "DeliveryRecord" ADD COLUMN "receivedBy" TEXT;
