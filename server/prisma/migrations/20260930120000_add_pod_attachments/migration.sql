-- CreateTable
CREATE TABLE "PodAttachment" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PodAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PodAttachment_storageKey_key" ON "PodAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "PodAttachment_recordId_createdAt_idx" ON "PodAttachment"("recordId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "PodAttachment" ADD CONSTRAINT "PodAttachment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "DeliveryRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodAttachment" ADD CONSTRAINT "PodAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
