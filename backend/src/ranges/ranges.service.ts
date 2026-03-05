import { prisma } from "../prisma.js";

export async function listRanges() {
  return prisma.productRange.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { products: true } },
    },
  });
}

export async function getRangeById(id: string) {
  return prisma.productRange.findUnique({
    where: { id },
    include: {
      _count: { select: { products: true } },
    },
  });
}

export async function createRange(name: string, userId: string) {
  return prisma.productRange.create({
    data: { name, createdById: userId },
    include: {
      _count: { select: { products: true } },
    },
  });
}

export async function findRangeByName(name: string) {
  return prisma.productRange.findUnique({ where: { name } });
}

export async function updateRange(id: string, name: string) {
  return prisma.productRange.update({
    where: { id },
    data: { name },
    include: {
      _count: { select: { products: true } },
    },
  });
}

export async function deleteRange(id: string) {
  const count = await prisma.product.count({ where: { rangeId: id } });
  if (count > 0) {
    throw new Error("RANGE_NOT_EMPTY");
  }
  return prisma.productRange.delete({ where: { id } });
}
