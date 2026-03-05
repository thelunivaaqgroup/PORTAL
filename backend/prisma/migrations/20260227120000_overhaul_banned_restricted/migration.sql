-- CreateEnum
CREATE TYPE "BannedRestrictedFetchStatus" AS ENUM ('SUCCESS', 'FAILED');

-- DropForeignKey
ALTER TABLE "banned_restricted_findings" DROP CONSTRAINT "banned_restricted_findings_snapshotId_fkey";

-- DropForeignKey
ALTER TABLE "banned_restricted_links" DROP CONSTRAINT "banned_restricted_links_snapshotId_fkey";

-- AlterTable
ALTER TABLE "banned_restricted_snapshots" DROP COLUMN "rawHtml";

-- DropTable
DROP TABLE "banned_restricted_findings";

-- DropTable
DROP TABLE "banned_restricted_links";

-- DropEnum
DROP TYPE "RestrictionCategory";

-- CreateTable
CREATE TABLE "banned_restricted_sources" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "linkType" "BannedRestrictedLinkType" NOT NULL,
    "fetchStatus" "BannedRestrictedFetchStatus" NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentHash" TEXT,
    "rawContentSize" INTEGER,
    "errorMessage" TEXT,

    CONSTRAINT "banned_restricted_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banned_restricted_chemicals" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "normalizedCasNo" TEXT NOT NULL,
    "chemicalName" TEXT,
    "matchText" TEXT,
    "evidenceUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banned_restricted_chemicals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "banned_restricted_sources_snapshotId_idx" ON "banned_restricted_sources"("snapshotId");

-- CreateIndex
CREATE INDEX "banned_restricted_chemicals_normalizedCasNo_idx" ON "banned_restricted_chemicals"("normalizedCasNo");

-- CreateIndex
CREATE UNIQUE INDEX "banned_restricted_chemicals_snapshotId_sourceId_normalizedC_key" ON "banned_restricted_chemicals"("snapshotId", "sourceId", "normalizedCasNo");

-- AddForeignKey
ALTER TABLE "banned_restricted_sources" ADD CONSTRAINT "banned_restricted_sources_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "banned_restricted_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banned_restricted_chemicals" ADD CONSTRAINT "banned_restricted_chemicals_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "banned_restricted_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banned_restricted_chemicals" ADD CONSTRAINT "banned_restricted_chemicals_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "banned_restricted_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
