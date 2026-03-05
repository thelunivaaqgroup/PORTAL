-- CreateTable
CREATE TABLE "aicis_inventory_snapshots" (
    "id" TEXT NOT NULL,
    "versionName" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedByUserId" TEXT NOT NULL,

    CONSTRAINT "aicis_inventory_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aicis_inventory_chemicals" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "crNo" TEXT NOT NULL,
    "casNo" TEXT,
    "chemicalName" TEXT,
    "approvedName" TEXT NOT NULL,
    "molecularFormula" TEXT,
    "specificInfoRequirements" TEXT,
    "definedScope" TEXT,
    "conditionsOfUse" TEXT,
    "prescribedInfo" TEXT,
    "normalizedApprovedName" TEXT NOT NULL,
    "normalizedCasNo" TEXT,

    CONSTRAINT "aicis_inventory_chemicals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_aicis_scrutiny_snapshots" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "regionCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "foundCount" INTEGER NOT NULL,
    "notFoundCount" INTEGER NOT NULL,
    "ambiguousCount" INTEGER NOT NULL,
    "unmatchedCount" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "upload_aicis_scrutiny_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_aicis_scrutiny_row_findings" (
    "id" TEXT NOT NULL,
    "scrutinySnapshotId" TEXT NOT NULL,
    "uploadRowId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "matchMethod" TEXT NOT NULL,
    "matchedCrNo" TEXT,
    "matchedCasNo" TEXT,
    "matchedApprovedName" TEXT,
    "evidenceJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_aicis_scrutiny_row_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "aicis_inventory_snapshots_versionName_key" ON "aicis_inventory_snapshots"("versionName");

-- CreateIndex
CREATE INDEX "aicis_inventory_chemicals_snapshotId_normalizedCasNo_idx" ON "aicis_inventory_chemicals"("snapshotId", "normalizedCasNo");

-- CreateIndex
CREATE INDEX "aicis_inventory_chemicals_snapshotId_normalizedApprovedName_idx" ON "aicis_inventory_chemicals"("snapshotId", "normalizedApprovedName");

-- CreateIndex
CREATE INDEX "aicis_inventory_chemicals_crNo_idx" ON "aicis_inventory_chemicals"("crNo");

-- CreateIndex
CREATE UNIQUE INDEX "aicis_inventory_chemicals_snapshotId_crNo_key" ON "aicis_inventory_chemicals"("snapshotId", "crNo");

-- CreateIndex
CREATE INDEX "upload_aicis_scrutiny_snapshots_uploadId_regionCode_isActiv_idx" ON "upload_aicis_scrutiny_snapshots"("uploadId", "regionCode", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "upload_aicis_scrutiny_row_findings_scrutinySnapshotId_uploa_key" ON "upload_aicis_scrutiny_row_findings"("scrutinySnapshotId", "uploadRowId");

-- AddForeignKey
ALTER TABLE "aicis_inventory_snapshots" ADD CONSTRAINT "aicis_inventory_snapshots_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aicis_inventory_chemicals" ADD CONSTRAINT "aicis_inventory_chemicals_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "aicis_inventory_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_aicis_scrutiny_snapshots" ADD CONSTRAINT "upload_aicis_scrutiny_snapshots_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "formulation_uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_aicis_scrutiny_snapshots" ADD CONSTRAINT "upload_aicis_scrutiny_snapshots_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "aicis_inventory_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_aicis_scrutiny_snapshots" ADD CONSTRAINT "upload_aicis_scrutiny_snapshots_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_aicis_scrutiny_row_findings" ADD CONSTRAINT "upload_aicis_scrutiny_row_findings_scrutinySnapshotId_fkey" FOREIGN KEY ("scrutinySnapshotId") REFERENCES "upload_aicis_scrutiny_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_aicis_scrutiny_row_findings" ADD CONSTRAINT "upload_aicis_scrutiny_row_findings_uploadRowId_fkey" FOREIGN KEY ("uploadRowId") REFERENCES "formulation_upload_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
