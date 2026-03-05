import { prisma } from "../prisma.js";
import { getNextSkuCode } from "../products/sku.service.js";
import type { CreateGreenfieldBody, UpdateGreenfieldBody, ConvertGreenfieldBody } from "./greenfield.types.js";

const CREATOR_SELECT = { select: { id: true, fullName: true, email: true } } as const;
const CONVERTED_PRODUCT_SELECT = { select: { id: true, name: true, skuCode: true } } as const;

const INCLUDE_RELATIONS = {
  createdBy: CREATOR_SELECT,
  convertedProduct: CONVERTED_PRODUCT_SELECT,
} as const;

export async function listGreenfield() {
  return prisma.greenfieldIdea.findMany({
    orderBy: { updatedAt: "desc" },
    include: INCLUDE_RELATIONS,
  });
}

export async function getGreenfieldById(id: string) {
  return prisma.greenfieldIdea.findUnique({
    where: { id },
    include: INCLUDE_RELATIONS,
  });
}

export async function createGreenfield(body: CreateGreenfieldBody, userId: string) {
  return prisma.greenfieldIdea.create({
    data: {
      title: body.title,
      conceptNotes: body.conceptNotes ?? null,
      targetAudience: body.targetAudience ?? null,
      ingredientsVision: body.ingredientsVision ?? null,
      marketPositioning: body.marketPositioning ?? null,
      additionalNotes: body.additionalNotes ?? null,
      createdById: userId,
    },
    include: INCLUDE_RELATIONS,
  });
}

export async function updateGreenfield(id: string, body: UpdateGreenfieldBody) {
  return prisma.greenfieldIdea.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.conceptNotes !== undefined && { conceptNotes: body.conceptNotes }),
      ...(body.targetAudience !== undefined && { targetAudience: body.targetAudience }),
      ...(body.ingredientsVision !== undefined && { ingredientsVision: body.ingredientsVision }),
      ...(body.marketPositioning !== undefined && { marketPositioning: body.marketPositioning }),
      ...(body.additionalNotes !== undefined && { additionalNotes: body.additionalNotes }),
    },
    include: INCLUDE_RELATIONS,
  });
}

export async function markReady(id: string) {
  return prisma.greenfieldIdea.update({
    where: { id },
    data: { status: "READY_TO_CONVERT" },
    include: INCLUDE_RELATIONS,
  });
}

export async function archiveGreenfield(id: string) {
  return prisma.greenfieldIdea.update({
    where: { id },
    data: { status: "ARCHIVED" },
    include: INCLUDE_RELATIONS,
  });
}

export async function convertGreenfield(
  id: string,
  body: ConvertGreenfieldBody,
  userId: string,
) {
  // Validate range exists
  const range = await prisma.productRange.findUnique({ where: { id: body.rangeId } });
  if (!range) {
    throw new Error("RANGE_NOT_FOUND");
  }

  return prisma.$transaction(async (tx) => {
    const skuCode = await getNextSkuCode(tx);

    const product = await tx.product.create({
      data: {
        name: body.productName,
        rangeId: body.rangeId,
        brand: body.brand ?? null,
        skuCode,
        targetRegions: [],
        createdByUserId: userId,
      },
      include: {
        createdBy: CREATOR_SELECT,
        range: { select: { id: true, name: true } },
      },
    });

    const idea = await tx.greenfieldIdea.update({
      where: { id },
      data: {
        status: "CONVERTED",
        convertedProductId: product.id,
      },
      include: INCLUDE_RELATIONS,
    });

    return { idea, product };
  });
}
