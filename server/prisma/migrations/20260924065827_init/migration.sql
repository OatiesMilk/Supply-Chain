-- CreateIndex
CREATE INDEX "AuditLog_recordId_recordType_timestamp_idx" ON "AuditLog"("recordId", "recordType", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_changedById_idx" ON "AuditLog"("changedById");

-- CreateIndex
CREATE INDEX "Comment_recordId_recordType_idx" ON "Comment"("recordId", "recordType");

-- CreateIndex
CREATE INDEX "DeliveryRecord_deletedAt_category_status_idx" ON "DeliveryRecord"("deletedAt", "category", "status");

-- CreateIndex
CREATE INDEX "DeliveryRecord_driver_idx" ON "DeliveryRecord"("driver");

-- CreateIndex
CREATE INDEX "DeliveryRecord_deliveryDate_idx" ON "DeliveryRecord"("deliveryDate");

-- CreateIndex
CREATE INDEX "DeliveryRecord_companyId_idx" ON "DeliveryRecord"("companyId");

-- CreateIndex
CREATE INDEX "DeliveryRecord_accountManager_idx" ON "DeliveryRecord"("accountManager");

-- CreateIndex
CREATE INDEX "DeliveryRecord_linkedCollectionId_idx" ON "DeliveryRecord"("linkedCollectionId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_productId_date_idx" ON "InventoryTransaction"("productId", "date" DESC);

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "RemarkLog_recordId_createdAt_idx" ON "RemarkLog"("recordId", "createdAt" DESC);
