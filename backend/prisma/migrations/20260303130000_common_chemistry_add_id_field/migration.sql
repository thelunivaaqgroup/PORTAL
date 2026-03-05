-- Drop primary key constraint (not the index)
ALTER TABLE "common_chemistry_cas_cache" DROP CONSTRAINT "common_chemistry_cas_cache_pkey";

-- Add id column with default
ALTER TABLE "common_chemistry_cas_cache" ADD COLUMN "id" TEXT NOT NULL DEFAULT gen_random_uuid();

-- Set id as new primary key
ALTER TABLE "common_chemistry_cas_cache" ADD CONSTRAINT "common_chemistry_cas_cache_pkey" PRIMARY KEY ("id");

-- Add unique constraint on casNo
CREATE UNIQUE INDEX "common_chemistry_cas_cache_casNo_key" ON "common_chemistry_cas_cache"("casNo");
