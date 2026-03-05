-- AlterTable
ALTER TABLE "formulation_upload_rows" ADD COLUMN     "matchConfidence" DOUBLE PRECISION,
ADD COLUMN     "matchType" TEXT,
ADD COLUMN     "matchedIngredientId" TEXT;

-- CreateIndex
CREATE INDEX "formulation_upload_rows_matchedIngredientId_idx" ON "formulation_upload_rows"("matchedIngredientId");

-- AddForeignKey
ALTER TABLE "formulation_upload_rows" ADD CONSTRAINT "formulation_upload_rows_matchedIngredientId_fkey" FOREIGN KEY ("matchedIngredientId") REFERENCES "ingredient_masters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
