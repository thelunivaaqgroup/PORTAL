-- CreateEnum
CREATE TYPE "FormulationUploadStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- AlterTable: add status, version, archivedAt, archivedByUserId to formulation_uploads
ALTER TABLE "formulation_uploads" ADD COLUMN "status" "FormulationUploadStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "formulation_uploads" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "formulation_uploads" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "formulation_uploads" ADD COLUMN "archivedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "formulation_uploads" ADD CONSTRAINT "formulation_uploads_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "formulation_uploads_productId_status_idx" ON "formulation_uploads"("productId", "status");

-- Backfill: set all existing records to ACTIVE with version computed per product
-- For products with multiple uploads, assign version by creation order
WITH versioned AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "productId" ORDER BY "createdAt" ASC) AS rn
  FROM "formulation_uploads"
  WHERE "productId" IS NOT NULL
)
UPDATE "formulation_uploads" fu
SET "version" = v.rn
FROM versioned v
WHERE fu.id = v.id;
