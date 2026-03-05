import { prisma } from "../prisma.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { logger } from "../logger.js";
import type { SaveIdeationBody } from "./ideation.types.js";

const INCLUDE_CREATED_BY = {
  createdBy: { select: { id: true, fullName: true } },
} as const;

/* ------------------------------------------------------------------ */
/*  A) Get latest (active) ideation for a product                      */
/* ------------------------------------------------------------------ */

export async function getLatestIdeation(productId: string) {
  return prisma.productIdeation.findFirst({
    where: { productId, isActive: true },
    include: INCLUDE_CREATED_BY,
  });
}

/* ------------------------------------------------------------------ */
/*  B) List all ideation versions for a product                        */
/* ------------------------------------------------------------------ */

export async function listIdeationVersions(productId: string) {
  return prisma.productIdeation.findMany({
    where: { productId },
    orderBy: { versionNumber: "desc" },
    include: INCLUDE_CREATED_BY,
  });
}

/* ------------------------------------------------------------------ */
/*  C) Save new ideation version (always creates a new row)            */
/* ------------------------------------------------------------------ */

export async function saveIdeationVersion(
  productId: string,
  body: SaveIdeationBody,
  actorUserId: string,
  requestId: string,
) {
  // Validate product exists
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) {
    throw new Error("PRODUCT_NOT_FOUND");
  }

  // Validate competitor links if provided
  if (body.competitorLinks) {
    for (const link of body.competitorLinks) {
      if (!link.label || typeof link.label !== "string") {
        throw new Error("INVALID_COMPETITOR_LINK");
      }
      if (!link.url || typeof link.url !== "string" || !/^https?:\/\//i.test(link.url)) {
        throw new Error("INVALID_URL");
      }
    }
  }

  const ideation = await prisma.$transaction(async (tx) => {
    // Find max version number for this product
    const maxVersion = await tx.productIdeation.aggregate({
      where: { productId },
      _max: { versionNumber: true },
    });
    const nextVersion = (maxVersion._max.versionNumber ?? 0) + 1;

    // Deactivate all existing versions
    await tx.productIdeation.updateMany({
      where: { productId },
      data: { isActive: false },
    });

    // Create new active version
    return tx.productIdeation.create({
      data: {
        productId,
        conceptNotes: body.conceptNotes ?? null,
        targetAudience: body.targetAudience ?? null,
        ingredientsVision: body.ingredientsVision ?? null,
        marketPositioning: body.marketPositioning ?? null,
        competitorLinksJson: body.competitorLinks ?? undefined,
        additionalNotes: body.additionalNotes ?? null,
        versionNumber: nextVersion,
        isActive: true,
        createdByUserId: actorUserId,
      },
      include: INCLUDE_CREATED_BY,
    });
  });

  await writeAuditLog({
    actorUserId,
    action: "IDEATION_SAVED",
    entityType: "product_ideation",
    entityId: ideation.id,
    requestId,
    metadata: { productId, versionNumber: ideation.versionNumber },
  });

  logger.info({
    event: "ideation_saved",
    productId,
    ideationId: ideation.id,
    versionNumber: ideation.versionNumber,
  });

  return ideation;
}

/* ------------------------------------------------------------------ */
/*  D) Activate a specific ideation version                            */
/* ------------------------------------------------------------------ */

export async function activateIdeationVersion(
  productId: string,
  ideationId: string,
  actorUserId: string,
  requestId: string,
) {
  // Ensure ideation belongs to product
  const ideation = await prisma.productIdeation.findUnique({
    where: { id: ideationId },
    select: { id: true, productId: true, versionNumber: true },
  });
  if (!ideation || ideation.productId !== productId) {
    throw new Error("IDEATION_NOT_FOUND");
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Deactivate all versions for this product
    await tx.productIdeation.updateMany({
      where: { productId },
      data: { isActive: false },
    });

    // Activate the specified version
    return tx.productIdeation.update({
      where: { id: ideationId },
      data: { isActive: true },
      include: INCLUDE_CREATED_BY,
    });
  });

  await writeAuditLog({
    actorUserId,
    action: "IDEATION_ACTIVATED",
    entityType: "product_ideation",
    entityId: ideationId,
    requestId,
    metadata: { productId, versionNumber: updated.versionNumber },
  });

  logger.info({
    event: "ideation_activated",
    productId,
    ideationId,
    versionNumber: updated.versionNumber,
  });

  return updated;
}
