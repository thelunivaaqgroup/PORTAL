-- CreateEnum
CREATE TYPE "IngredientType" AS ENUM ('STANDARD', 'BOTANICAL', 'BLEND', 'POLYMER', 'TRADE_NAME');

-- AlterTable
ALTER TABLE "compliance_requests" ADD COLUMN     "strictMode" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "formulation_upload_rows" ADD COLUMN     "ingredientType" "IngredientType",
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedByUserId" TEXT;

-- CreateTable
CREATE TABLE "trade_name_aliases" (
    "id" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "canonicalInci" TEXT NOT NULL,
    "casNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_name_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_evidence_docs" (
    "id" TEXT NOT NULL,
    "uploadRowId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "docType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "ingredient_evidence_docs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trade_name_aliases_tradeName_key" ON "trade_name_aliases"("tradeName");

-- CreateIndex
CREATE INDEX "ingredient_evidence_docs_uploadRowId_idx" ON "ingredient_evidence_docs"("uploadRowId");

-- AddForeignKey
ALTER TABLE "ingredient_evidence_docs" ADD CONSTRAINT "ingredient_evidence_docs_uploadRowId_fkey" FOREIGN KEY ("uploadRowId") REFERENCES "formulation_upload_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
