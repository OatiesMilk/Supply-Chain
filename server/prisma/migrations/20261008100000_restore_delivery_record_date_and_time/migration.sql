-- TSK-109 restores the optional local date-time alongside Delivery Date.
ALTER TABLE "DeliveryRecord" ADD COLUMN "dateAndTime" TEXT;
