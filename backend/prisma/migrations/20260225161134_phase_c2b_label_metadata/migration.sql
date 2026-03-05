-- CreateEnum
CREATE TYPE "RegionCode" AS ENUM ('IN', 'AU');

-- CreateTable
CREATE TABLE "label_metadata" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "region" "RegionCode" NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "productName" TEXT NOT NULL,
    "netQuantity" TEXT NOT NULL,
    "inciDeclaration" TEXT NOT NULL,
    "warnings" TEXT,
    "manufacturerName" TEXT,
    "manufacturerAddress" TEXT,
    "batchFormat" TEXT,
    "mfgDate" TIMESTAMP(3),
    "expDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "label_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "label_metadata_productId_region_isActive_idx" ON "label_metadata"("productId", "region", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "label_metadata_productId_region_versionNumber_key" ON "label_metadata"("productId", "region", "versionNumber");

-- AddForeignKey
ALTER TABLE "label_metadata" ADD CONSTRAINT "label_metadata_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "label_metadata" ADD CONSTRAINT "label_metadata_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
