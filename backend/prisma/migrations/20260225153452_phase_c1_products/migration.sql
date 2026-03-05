-- CreateEnum
CREATE TYPE "ProductStage" AS ENUM ('IDEA', 'R_AND_D', 'COMPLIANCE_READY', 'PACKAGING_READY', 'MANUFACTURING', 'READY_TO_SELL', 'LIVE', 'DISCONTINUED');

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productLine" TEXT,
    "skuCode" TEXT NOT NULL,
    "stage" "ProductStage" NOT NULL DEFAULT 'IDEA',
    "targetRegions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "activeFormulationId" TEXT,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_stage_events" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fromStage" "ProductStage" NOT NULL,
    "toStage" "ProductStage" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "product_stage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_skuCode_key" ON "products"("skuCode");

-- CreateIndex
CREATE INDEX "product_stage_events_productId_createdAt_idx" ON "product_stage_events"("productId", "createdAt");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_activeFormulationId_fkey" FOREIGN KEY ("activeFormulationId") REFERENCES "formulations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stage_events" ADD CONSTRAINT "product_stage_events_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stage_events" ADD CONSTRAINT "product_stage_events_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
