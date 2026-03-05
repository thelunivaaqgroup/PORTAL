-- Add Common Chemistry enrichment fields to scrutiny row findings
ALTER TABLE "upload_aicis_scrutiny_row_findings" ADD COLUMN "commonChemistryName" TEXT;
ALTER TABLE "upload_aicis_scrutiny_row_findings" ADD COLUMN "commonChemistryUrl" TEXT;
ALTER TABLE "upload_aicis_scrutiny_row_findings" ADD COLUMN "commonChemistryStatus" TEXT;
ALTER TABLE "upload_aicis_scrutiny_row_findings" ADD COLUMN "commonChemistryReason" TEXT;
ALTER TABLE "upload_aicis_scrutiny_row_findings" ADD COLUMN "commonChemistryFetchedAt" TIMESTAMPTZ;
