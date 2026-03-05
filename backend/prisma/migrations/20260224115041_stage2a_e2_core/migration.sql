-- CreateEnum
CREATE TYPE "FormulationStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('MSDS', 'COA', 'TDS', 'SPEC_SHEET', 'OTHER');

-- CreateTable
CREATE TABLE "product_skus" (
    "id" TEXT NOT NULL,
    "skuCode" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_skus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formulations" (
    "id" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "formulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formulation_versions" (
    "id" TEXT NOT NULL,
    "formulationId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "FormulationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "submittedById" TEXT,
    "approvedById" TEXT,
    "rejectedById" TEXT,
    "rejectionReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "formulation_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formulation_ingredients" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "ingredientName" TEXT NOT NULL,
    "function" TEXT NOT NULL,
    "concentrationPct" DECIMAL(6,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formulation_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_skus_skuCode_key" ON "product_skus"("skuCode");

-- CreateIndex
CREATE UNIQUE INDEX "formulations_currentVersionId_key" ON "formulations"("currentVersionId");

-- CreateIndex
CREATE INDEX "formulations_skuId_idx" ON "formulations"("skuId");

-- CreateIndex
CREATE INDEX "formulation_versions_formulationId_idx" ON "formulation_versions"("formulationId");

-- CreateIndex
CREATE UNIQUE INDEX "formulation_versions_formulationId_versionNumber_key" ON "formulation_versions"("formulationId", "versionNumber");

-- CreateIndex
CREATE INDEX "formulation_ingredients_versionId_idx" ON "formulation_ingredients"("versionId");

-- CreateIndex
CREATE INDEX "documents_versionId_idx" ON "documents"("versionId");

-- AddForeignKey
ALTER TABLE "formulations" ADD CONSTRAINT "formulations_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "product_skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formulations" ADD CONSTRAINT "formulations_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "formulation_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formulations" ADD CONSTRAINT "formulations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formulation_versions" ADD CONSTRAINT "formulation_versions_formulationId_fkey" FOREIGN KEY ("formulationId") REFERENCES "formulations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formulation_versions" ADD CONSTRAINT "formulation_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formulation_versions" ADD CONSTRAINT "formulation_versions_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formulation_versions" ADD CONSTRAINT "formulation_versions_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formulation_versions" ADD CONSTRAINT "formulation_versions_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formulation_ingredients" ADD CONSTRAINT "formulation_ingredients_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "formulation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "formulation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
