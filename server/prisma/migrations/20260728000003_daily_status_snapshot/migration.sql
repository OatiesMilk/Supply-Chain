CREATE TABLE "DailyStatusSnapshot" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "date"      TEXT NOT NULL,
  "category"  TEXT NOT NULL,
  "status"    TEXT NOT NULL,
  "count"     INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "DailyStatusSnapshot_date_category_status_key"
  ON "DailyStatusSnapshot"("date", "category", "status");
