-- Add auditable artifact columns to banned_restricted_sources
ALTER TABLE "banned_restricted_sources" ADD COLUMN "rawHtml" TEXT;
ALTER TABLE "banned_restricted_sources" ADD COLUMN "screenshotPath" TEXT;
