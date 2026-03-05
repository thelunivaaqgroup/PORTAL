/*
  Warnings:

  - You are about to drop the column `category` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `categoryId` on the `products` table. All the data in the column will be lost.
  - You are about to drop the `product_categories` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `rangeId` to the `products` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "product_categories" DROP CONSTRAINT "product_categories_createdById_fkey";

-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_categoryId_fkey";

-- AlterTable
ALTER TABLE "products" DROP COLUMN "category",
DROP COLUMN "categoryId",
ADD COLUMN     "rangeId" TEXT NOT NULL;

-- DropTable
DROP TABLE "product_categories";

-- CreateTable
CREATE TABLE "product_ranges" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "product_ranges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_ranges_name_key" ON "product_ranges"("name");

-- CreateIndex
CREATE INDEX "products_rangeId_idx" ON "products"("rangeId");

-- AddForeignKey
ALTER TABLE "product_ranges" ADD CONSTRAINT "product_ranges_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_rangeId_fkey" FOREIGN KEY ("rangeId") REFERENCES "product_ranges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
