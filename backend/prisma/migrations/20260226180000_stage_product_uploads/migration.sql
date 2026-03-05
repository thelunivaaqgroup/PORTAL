-- AlterTable: add productId to formulation_uploads (nullable initially)
ALTER TABLE "formulation_uploads" ADD COLUMN "productId" TEXT;

-- AlterTable: add latestUploadId to products (nullable, unique)
ALTER TABLE "products" ADD COLUMN "latestUploadId" TEXT;

-- CreateIndex
CREATE INDEX "formulation_uploads_productId_idx" ON "formulation_uploads"("productId");

-- CreateIndex (unique constraint for 1:1 relation)
CREATE UNIQUE INDEX "products_latestUploadId_key" ON "products"("latestUploadId");

-- AddForeignKey: formulation_uploads.productId -> products.id
ALTER TABLE "formulation_uploads" ADD CONSTRAINT "formulation_uploads_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: products.latestUploadId -> formulation_uploads.id
ALTER TABLE "products" ADD CONSTRAINT "products_latestUploadId_fkey" FOREIGN KEY ("latestUploadId") REFERENCES "formulation_uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: set productId on existing formulation_uploads
UPDATE "formulation_uploads" fu
SET "productId" = p.id
FROM "formulations" f
JOIN "products" p ON p."activeFormulationId" = f.id
WHERE fu."formulationId" = f.id;

-- Backfill: set latestUploadId on products that have an activeFormulation with uploads
UPDATE "products" p
SET "latestUploadId" = sub."uploadId"
FROM (
  SELECT DISTINCT ON (p2.id) p2.id AS "productId", fu.id AS "uploadId"
  FROM "products" p2
  JOIN "formulations" f ON f.id = p2."activeFormulationId"
  JOIN "formulation_uploads" fu ON fu."formulationId" = f.id
  ORDER BY p2.id, fu."createdAt" DESC
) sub
WHERE p.id = sub."productId";
