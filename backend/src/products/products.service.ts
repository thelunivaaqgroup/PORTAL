import { prisma } from "../prisma.js";
import { getNextSkuCode } from "./sku.service.js";
import type { CreateProductBody, UpdateProductBody } from "./products.types.js";

const RANGE_INCLUDE = { select: { id: true, name: true } } as const;

export async function createProduct(body: CreateProductBody, userId: string) {
  // Validate rangeId exists
  const range = await prisma.productRange.findUnique({ where: { id: body.rangeId } });
  if (!range) {
    throw new Error("RANGE_NOT_FOUND");
  }

  return prisma.$transaction(async (tx) => {
    const skuCode = await getNextSkuCode(tx);

    return tx.product.create({
      data: {
        name: body.name,
        productLine: body.productLine ?? null,
        brand: body.brand ?? null,
        skuCode,
        stage: "PRE_LIFECYCLE",
        targetRegions: body.targetRegions,
        createdByUserId: userId,
        rangeId: body.rangeId,
      },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
        range: RANGE_INCLUDE,
      },
    });
  });
}

export async function listProducts() {
  return prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, fullName: true, email: true } },
      activeFormulation: {
        select: {
          id: true,
          skuId: true,
          sku: { select: { skuCode: true, productName: true } },
          _count: { select: { uploads: true } },
        },
      },
      latestUpload: {
        select: {
          id: true,
          fileName: true,
          createdAt: true,
        },
      },
      range: RANGE_INCLUDE,
    },
  });
}

export async function listProductsByRange(rangeId: string) {
  return prisma.product.findMany({
    where: { rangeId },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, fullName: true, email: true } },
      activeFormulation: {
        select: {
          id: true,
          skuId: true,
          sku: { select: { skuCode: true, productName: true } },
          _count: { select: { uploads: true } },
        },
      },
      latestUpload: {
        select: {
          id: true,
          fileName: true,
          createdAt: true,
        },
      },
      range: RANGE_INCLUDE,
    },
  });
}

export async function getProductById(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, fullName: true, email: true } },
      activeFormulation: {
        select: {
          id: true,
          skuId: true,
          sku: { select: { skuCode: true, productName: true } },
          uploads: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              complianceSnapshots: true,
            },
          },
        },
      },
      latestUpload: {
        include: {
          rows: {
            orderBy: { createdAt: "asc" },
            include: { matchedIngredient: { select: { id: true, inciName: true } } },
          },
          complianceSnapshots: true,
        },
      },
      // Archived formulation uploads for history display
      uploads: {
        where: { status: "ARCHIVED" },
        orderBy: { archivedAt: "desc" },
        select: {
          id: true,
          fileName: true,
          version: true,
          status: true,
          createdAt: true,
          archivedAt: true,
          archivedBy: { select: { id: true, fullName: true } },
          createdBy: { select: { id: true, fullName: true } },
          _count: { select: { rows: true } },
        },
      },
      range: RANGE_INCLUDE,
      stageEvents: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          createdBy: { select: { id: true, fullName: true } },
        },
      },
    },
  });
}

export async function updateProduct(id: string, body: UpdateProductBody) {
  // If rangeId is being changed, validate it exists
  if (body.rangeId) {
    const range = await prisma.productRange.findUnique({ where: { id: body.rangeId } });
    if (!range) {
      throw new Error("RANGE_NOT_FOUND");
    }
  }

  return prisma.product.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.productLine !== undefined && { productLine: body.productLine }),
      ...(body.targetRegions !== undefined && { targetRegions: body.targetRegions }),
      ...(body.brand !== undefined && { brand: body.brand }),
      ...(body.rangeId !== undefined && { rangeId: body.rangeId }),
    },
    include: {
      createdBy: { select: { id: true, fullName: true, email: true } },
      range: RANGE_INCLUDE,
    },
  });
}

export async function deleteProduct(id: string) {
  // Delete related data first
  await prisma.$transaction(async (tx) => {
    await tx.finishedGoodLot.deleteMany({ where: { productId: id } });
    await tx.batchConsumption.deleteMany({
      where: { batch: { productId: id } },
    });
    await tx.batch.deleteMany({ where: { productId: id } });
    await tx.productDocument.deleteMany({ where: { productId: id } });
    await tx.labelMetadata.deleteMany({ where: { productId: id } });
    await tx.productStageEvent.deleteMany({ where: { productId: id } });
    await tx.productIdeation.deleteMany({ where: { productId: id } });
    await tx.systemAlert.deleteMany({ where: { productId: id } });
    await tx.product.delete({ where: { id } });
  });
}

