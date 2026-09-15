-- CreateTable
CREATE TABLE "RemarkLog" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemarkLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RemarkLog" ADD CONSTRAINT "RemarkLog_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
