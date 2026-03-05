-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'INGREDIENT_DATASHEET';

-- AlterTable
ALTER TABLE "formulation_versions" ADD COLUMN     "hasDuplicateIngredients" BOOLEAN,
ADD COLUMN     "missingDocTypes" TEXT[],
ADD COLUMN     "riskLevel" "RiskLevel",
ADD COLUMN     "totalPct" DECIMAL(6,3),
ADD COLUMN     "validatedAt" TIMESTAMP(3),
ADD COLUMN     "validationStatus" "ValidationStatus";
