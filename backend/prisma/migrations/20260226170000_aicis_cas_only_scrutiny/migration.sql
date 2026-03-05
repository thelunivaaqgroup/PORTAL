-- Add missingCasCount to scrutiny snapshots
ALTER TABLE "upload_aicis_scrutiny_snapshots"
  ADD COLUMN IF NOT EXISTS "missingCasCount" INTEGER NOT NULL DEFAULT 0;

-- Add casUsed and aicisChemicalId to row findings
ALTER TABLE "upload_aicis_scrutiny_row_findings"
  ADD COLUMN IF NOT EXISTS "casUsed" TEXT,
  ADD COLUMN IF NOT EXISTS "aicisChemicalId" TEXT;
