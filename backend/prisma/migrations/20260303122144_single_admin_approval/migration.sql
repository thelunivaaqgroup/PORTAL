-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EligibilityStatus" ADD VALUE 'READY_FOR_APPROVAL';
ALTER TYPE "EligibilityStatus" ADD VALUE 'APPROVED';

-- AlterTable
ALTER TABLE "compliance_requests" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "compliance_requests" ADD CONSTRAINT "compliance_requests_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
