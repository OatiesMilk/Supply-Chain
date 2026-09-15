-- Rename driverAssistant (single string) to driverAssistants (JSON array string)
ALTER TABLE "DeliveryRecord" RENAME COLUMN "driverAssistant" TO "driverAssistants";

-- Migrate existing plain-string values to JSON array format
UPDATE "DeliveryRecord"
SET "driverAssistants" = CASE
  WHEN "driverAssistants" IS NULL OR "driverAssistants" = '' THEN '[]'
  WHEN "driverAssistants" LIKE '[%]' THEN "driverAssistants"
  ELSE '["' || replace("driverAssistants", '"', '\"') || '"]'
END;
