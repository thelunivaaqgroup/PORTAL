-- CreateEnum
CREATE TYPE "BannedRestrictedLinkType" AS ENUM ('HUB', 'ROTTERDAM_IMPORT', 'ROTTERDAM_EXPORT', 'MINAMATA', 'STOCKHOLM', 'POISONS_STANDARD', 'OTHER');

-- CreateEnum
CREATE TYPE "RestrictionCategory" AS ENUM ('BANNED', 'RESTRICTED', 'UNKNOWN');

-- AlterTable
ALTER TABLE "aicis_inventory_snapshots" ALTER COLUMN "fileSha256" DROP DEFAULT;

-- AlterTable
ALTER TABLE "upload_aicis_scrutiny_snapshots" ALTER COLUMN "ambiguousCount" SET DEFAULT 0,
ALTER COLUMN "unmatchedCount" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "banned_restricted_snapshots" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentHash" TEXT NOT NULL,
    "rawHtml" TEXT NOT NULL,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "banned_restricted_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banned_restricted_links" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "linkType" "BannedRestrictedLinkType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banned_restricted_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banned_restricted_findings" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "casNo" TEXT,
    "chemicalName" TEXT,
    "restrictionCategory" "RestrictionCategory" NOT NULL DEFAULT 'UNKNOWN',
    "jurisdictionOrScheme" TEXT,
    "evidenceUrl" TEXT NOT NULL,
    "evidenceQuote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banned_restricted_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "banned_restricted_snapshots_fetchedAt_idx" ON "banned_restricted_snapshots"("fetchedAt");

-- CreateIndex
CREATE INDEX "banned_restricted_links_snapshotId_idx" ON "banned_restricted_links"("snapshotId");

-- CreateIndex
CREATE INDEX "banned_restricted_findings_snapshotId_idx" ON "banned_restricted_findings"("snapshotId");

-- CreateIndex
CREATE INDEX "banned_restricted_findings_casNo_idx" ON "banned_restricted_findings"("casNo");

-- AddForeignKey
ALTER TABLE "banned_restricted_snapshots" ADD CONSTRAINT "banned_restricted_snapshots_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banned_restricted_links" ADD CONSTRAINT "banned_restricted_links_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "banned_restricted_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banned_restricted_findings" ADD CONSTRAINT "banned_restricted_findings_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "banned_restricted_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
