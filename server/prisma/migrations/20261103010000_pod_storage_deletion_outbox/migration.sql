-- Keep cleanup jobs independent of business-row cascades and account deletion.
CREATE TABLE "PodStorageDeletion" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "storageNamespace" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PodStorageDeletion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PodStorageDeletion_storageNamespace_storageKey_key" ON "PodStorageDeletion"("storageNamespace", "storageKey");
CREATE INDEX "PodStorageDeletion_storageNamespace_nextAttemptAt_idx" ON "PodStorageDeletion"("storageNamespace", "nextAttemptAt");
