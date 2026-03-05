-- CreateEnum
CREATE TYPE "FinishedGoodLotStatus" AS ENUM ('AVAILABLE', 'EXHAUSTED');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "fillDensityGPerMl" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
ADD COLUMN     "packNetContentMl" INTEGER;

-- CreateTable
CREATE TABLE "finished_good_lots" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "unitsProduced" INTEGER NOT NULL,
    "unitsRemaining" INTEGER NOT NULL,
    "packNetContentMl" INTEGER NOT NULL,
    "fillDensityGPerMl" DOUBLE PRECISION NOT NULL,
    "totalFillableMl" DOUBLE PRECISION NOT NULL,
    "leftoverMl" DOUBLE PRECISION NOT NULL,
    "status" "FinishedGoodLotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "finished_good_lots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "finished_good_lots_productId_idx" ON "finished_good_lots"("productId");

-- CreateIndex
CREATE INDEX "finished_good_lots_status_idx" ON "finished_good_lots"("status");

-- CreateIndex
CREATE UNIQUE INDEX "finished_good_lots_batchId_key" ON "finished_good_lots"("batchId");

-- AddForeignKey
ALTER TABLE "finished_good_lots" ADD CONSTRAINT "finished_good_lots_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finished_good_lots" ADD CONSTRAINT "finished_good_lots_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finished_good_lots" ADD CONSTRAINT "finished_good_lots_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
