-- CreateEnum
CREATE TYPE "RawMaterialLotStatus" AS ENUM ('AVAILABLE', 'BLOCKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('CREATED', 'RELEASED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProductStage" ADD VALUE 'MANUFACTURING_APPROVED';
ALTER TYPE "ProductStage" ADD VALUE 'BATCH_CREATED';
ALTER TYPE "ProductStage" ADD VALUE 'BATCH_RELEASED';
ALTER TYPE "ProductStage" ADD VALUE 'READY_FOR_SALE';

-- CreateTable
CREATE TABLE "raw_material_lots" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierLotNumber" TEXT NOT NULL,
    "quantityReceivedKg" DOUBLE PRECISION NOT NULL,
    "quantityRemainingKg" DOUBLE PRECISION NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "status" "RawMaterialLotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "raw_material_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "productionQuantityKg" DOUBLE PRECISION NOT NULL,
    "manufacturingDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'CREATED',
    "formulationVersionId" TEXT NOT NULL,
    "labelVersionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_consumptions" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rawMaterialLotId" TEXT NOT NULL,
    "quantityConsumedKg" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "batch_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "raw_material_lots_ingredientId_idx" ON "raw_material_lots"("ingredientId");

-- CreateIndex
CREATE INDEX "raw_material_lots_status_idx" ON "raw_material_lots"("status");

-- CreateIndex
CREATE INDEX "raw_material_lots_expiryDate_idx" ON "raw_material_lots"("expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "batches_batchNumber_key" ON "batches"("batchNumber");

-- CreateIndex
CREATE INDEX "batches_productId_idx" ON "batches"("productId");

-- CreateIndex
CREATE INDEX "batch_consumptions_batchId_idx" ON "batch_consumptions"("batchId");

-- CreateIndex
CREATE INDEX "batch_consumptions_rawMaterialLotId_idx" ON "batch_consumptions"("rawMaterialLotId");

-- AddForeignKey
ALTER TABLE "raw_material_lots" ADD CONSTRAINT "raw_material_lots_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredient_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_lots" ADD CONSTRAINT "raw_material_lots_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_formulationVersionId_fkey" FOREIGN KEY ("formulationVersionId") REFERENCES "formulation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_labelVersionId_fkey" FOREIGN KEY ("labelVersionId") REFERENCES "label_metadata"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_consumptions" ADD CONSTRAINT "batch_consumptions_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_consumptions" ADD CONSTRAINT "batch_consumptions_rawMaterialLotId_fkey" FOREIGN KEY ("rawMaterialLotId") REFERENCES "raw_material_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
