-- CreateTable
CREATE TABLE "rule_sets" (
    "id" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_items" (
    "id" TEXT NOT NULL,
    "ruleSetId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "maxPercent" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "rule_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_compliance_snapshots" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "issuesJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_compliance_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rule_items_ruleSetId_idx" ON "rule_items"("ruleSetId");

-- CreateIndex
CREATE INDEX "upload_compliance_snapshots_uploadId_idx" ON "upload_compliance_snapshots"("uploadId");

-- AddForeignKey
ALTER TABLE "rule_items" ADD CONSTRAINT "rule_items_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "rule_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_items" ADD CONSTRAINT "rule_items_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredient_masters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_compliance_snapshots" ADD CONSTRAINT "upload_compliance_snapshots_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "formulation_uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
