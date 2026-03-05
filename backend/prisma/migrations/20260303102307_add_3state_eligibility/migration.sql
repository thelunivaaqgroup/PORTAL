-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('PASS', 'NEEDS_REVIEW', 'FAIL');

-- CreateEnum
CREATE TYPE "EligibilityStatus" AS ENUM ('ELIGIBLE', 'ELIGIBLE_WITH_WARNINGS', 'NOT_ELIGIBLE');

-- AlterTable
ALTER TABLE "compliance_requests" ADD COLUMN     "aicisScrutinyStatus" "CheckStatus",
ADD COLUMN     "bannedRestrictedStatus" "CheckStatus",
ADD COLUMN     "checkedAt" TIMESTAMP(3),
ADD COLUMN     "checkedByUserId" TEXT,
ADD COLUMN     "eligibilityStatus" "EligibilityStatus",
ADD COLUMN     "evidenceRequiredJson" JSONB,
ADD COLUMN     "ingredientMatchingStatus" "CheckStatus",
ADD COLUMN     "issuesJson" JSONB;

-- AddForeignKey
ALTER TABLE "compliance_requests" ADD CONSTRAINT "compliance_requests_checkedByUserId_fkey" FOREIGN KEY ("checkedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
