-- TSK-97 replaced the manual "Date & Time" field with the record's createdAt
-- and removed dateAndTime from schema.prisma without a migration. Without this,
-- every insert fails because the column is NOT NULL with no default.
ALTER TABLE "DeliveryRecord" DROP COLUMN "dateAndTime";
