-- CreateEnum
CREATE TYPE "ComplianceRequestStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GeneratedArtifactType" AS ENUM ('MARKETING_PLAN', 'LAYOUT_BRIEF', 'COLOR_SEQUENCE', 'PACKAGING_BRIEF');

-- CreateTable
CREATE TABLE "compliance_requests" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "regionScope" TEXT[],
    "status" "ComplianceRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "aicisSnapshotId" TEXT,
    "bannedRestrictedSnapshotId" TEXT,
    "eligibleAt" TIMESTAMP(3),
    "eligibilityReportJson" JSONB,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compliance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_approvals" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "approverUserId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_artifacts" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "GeneratedArtifactType" NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "contentMarkdown" TEXT,
    "contentJson" JSONB,
    "generationMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "generated_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "compliance_requests_productId_createdAt_idx" ON "compliance_requests"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "compliance_approvals_requestId_idx" ON "compliance_approvals"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_approvals_requestId_approverUserId_key" ON "compliance_approvals"("requestId", "approverUserId");

-- CreateIndex
CREATE INDEX "generated_artifacts_productId_type_idx" ON "generated_artifacts"("productId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "generated_artifacts_requestId_type_versionNumber_key" ON "generated_artifacts"("requestId", "type", "versionNumber");

-- AddForeignKey
ALTER TABLE "compliance_requests" ADD CONSTRAINT "compliance_requests_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_requests" ADD CONSTRAINT "compliance_requests_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "formulation_uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_requests" ADD CONSTRAINT "compliance_requests_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_approvals" ADD CONSTRAINT "compliance_approvals_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "compliance_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_approvals" ADD CONSTRAINT "compliance_approvals_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_artifacts" ADD CONSTRAINT "generated_artifacts_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "compliance_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_artifacts" ADD CONSTRAINT "generated_artifacts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_artifacts" ADD CONSTRAINT "generated_artifacts_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
