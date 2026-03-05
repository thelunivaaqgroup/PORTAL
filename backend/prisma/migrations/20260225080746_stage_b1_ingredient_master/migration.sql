-- CreateTable
CREATE TABLE "ingredient_masters" (
    "id" TEXT NOT NULL,
    "inciName" TEXT NOT NULL,
    "casNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "ingredient_masters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_synonyms" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ingredient_synonyms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_masters_inciName_key" ON "ingredient_masters"("inciName");

-- CreateIndex
CREATE INDEX "ingredient_synonyms_ingredientId_idx" ON "ingredient_synonyms"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_synonyms_ingredientId_name_key" ON "ingredient_synonyms"("ingredientId", "name");

-- AddForeignKey
ALTER TABLE "ingredient_masters" ADD CONSTRAINT "ingredient_masters_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_masters" ADD CONSTRAINT "ingredient_masters_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_synonyms" ADD CONSTRAINT "ingredient_synonyms_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredient_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
