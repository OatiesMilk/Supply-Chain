-- CreateTable: in-app notification bell entries (per-user, role-scoped)
CREATE TABLE "Notification" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "title"      TEXT NOT NULL,
    "message"    TEXT NOT NULL,
    "recordId"   TEXT,
    "recordType" TEXT,
    "isRead"     BOOLEAN NOT NULL DEFAULT false,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable: per-record comments visible in audit timeline
CREATE TABLE "Comment" (
    "id"         TEXT NOT NULL,
    "recordId"   TEXT NOT NULL,
    "recordType" TEXT NOT NULL DEFAULT 'DeliveryRecord',
    "body"       TEXT NOT NULL,
    "authorId"   TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
