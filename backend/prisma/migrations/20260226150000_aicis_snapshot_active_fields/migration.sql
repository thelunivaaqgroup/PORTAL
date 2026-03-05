-- DropIndex (remove unique on versionName since we use regionCode+fileSha256 now)
DROP INDEX IF EXISTS "aicis_inventory_snapshots_versionName_key";

-- AlterTable: add new columns with defaults so existing rows survive
ALTER TABLE "aicis_inventory_snapshots" ADD COLUMN IF NOT EXISTS "effectiveAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "fileSha256" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "notes" TEXT,
ADD COLUMN IF NOT EXISTS "regionCode" TEXT NOT NULL DEFAULT 'AU',
ADD COLUMN IF NOT EXISTS "rowCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "aicis_inventory_snapshots_regionCode_isActive_idx" ON "aicis_inventory_snapshots"("regionCode", "isActive");

-- CreateIndex (unique constraint on regionCode + fileSha256)
CREATE UNIQUE INDEX IF NOT EXISTS "aicis_inventory_snapshots_regionCode_fileSha256_key" ON "aicis_inventory_snapshots"("regionCode", "fileSha256");
