-- CreateTable
CREATE TABLE "formulation_uploads" (
    "id" TEXT NOT NULL,
    "formulationId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawExtractJson" JSONB,

    CONSTRAINT "formulation_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formulation_upload_rows" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "detectedPct" DOUBLE PRECISION,
    "inciSuggestion" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formulation_upload_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "formulation_uploads_formulationId_idx" ON "formulation_uploads"("formulationId");

-- CreateIndex
CREATE INDEX "formulation_upload_rows_uploadId_idx" ON "formulation_upload_rows"("uploadId");

-- AddForeignKey
ALTER TABLE "formulation_uploads" ADD CONSTRAINT "formulation_uploads_formulationId_fkey" FOREIGN KEY ("formulationId") REFERENCES "formulations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formulation_uploads" ADD CONSTRAINT "formulation_uploads_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formulation_upload_rows" ADD CONSTRAINT "formulation_upload_rows_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "formulation_uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
