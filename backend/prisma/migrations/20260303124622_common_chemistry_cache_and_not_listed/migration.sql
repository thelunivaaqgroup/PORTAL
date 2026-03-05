-- AlterTable
ALTER TABLE "upload_aicis_scrutiny_snapshots" ADD COLUMN     "notListedCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "common_chemistry_cas_cache" (
    "casNo" TEXT NOT NULL,
    "exists" BOOLEAN NOT NULL,
    "title" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceUrl" TEXT,

    CONSTRAINT "common_chemistry_cas_cache_pkey" PRIMARY KEY ("casNo")
);
