-- AlterTable
ALTER TABLE "products" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "category" TEXT;

-- CreateTable
CREATE TABLE "product_ideations" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "conceptNotes" TEXT,
    "targetAudience" TEXT,
    "ingredientsVision" TEXT,
    "marketPositioning" TEXT,
    "competitorLinksJson" JSONB,
    "additionalNotes" TEXT,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "product_ideations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_ideations_productId_idx" ON "product_ideations"("productId");

-- CreateIndex
CREATE INDEX "product_ideations_createdAt_idx" ON "product_ideations"("createdAt");

-- AddForeignKey
ALTER TABLE "product_ideations" ADD CONSTRAINT "product_ideations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_ideations" ADD CONSTRAINT "product_ideations_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
