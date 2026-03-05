import { prisma } from "../prisma.js";

export async function createSku(skuCode: string, productName: string) {
  return prisma.productSku.create({
    data: { skuCode, productName },
  });
}

export async function listSkus() {
  return prisma.productSku.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function findSkuByCode(skuCode: string) {
  return prisma.productSku.findUnique({ where: { skuCode } });
}
