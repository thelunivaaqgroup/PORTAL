-- Add needsReviewCount column to track CAS API error findings
ALTER TABLE "upload_aicis_scrutiny_snapshots" ADD COLUMN "needsReviewCount" INT NOT NULL DEFAULT 0;
