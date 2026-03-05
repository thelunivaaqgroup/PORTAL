-- AlterTable: add additionalJson to store multi-CAS arrays etc.
ALTER TABLE "aicis_inventory_chemicals" ADD COLUMN IF NOT EXISTS "additionalJson" JSONB;
