-- CreateEnum
CREATE TYPE "GreenfieldStatus" AS ENUM ('DRAFT', 'READY_TO_CONVERT', 'CONVERTED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "greenfield_ideas" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "conceptNotes" TEXT,
    "targetAudience" TEXT,
    "ingredientsVision" TEXT,
    "marketPositioning" TEXT,
    "additionalNotes" TEXT,
    "status" "GreenfieldStatus" NOT NULL DEFAULT 'DRAFT',
    "convertedProductId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "greenfield_ideas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "greenfield_ideas_status_idx" ON "greenfield_ideas"("status");

-- AddForeignKey
ALTER TABLE "greenfield_ideas" ADD CONSTRAINT "greenfield_ideas_convertedProductId_fkey" FOREIGN KEY ("convertedProductId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "greenfield_ideas" ADD CONSTRAINT "greenfield_ideas_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
