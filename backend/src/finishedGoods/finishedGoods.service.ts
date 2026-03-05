import { prisma } from "../prisma.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { logger } from "../logger.js";

/* ------------------------------------------------------------------ */
/*  A) Pure conversion — no DB                                         */
/* ------------------------------------------------------------------ */

export function computeFinishedGoodsFromBatchKg(params: {
  batchKg: number;
  packNetContentMl: number;
  fillDensityGPerMl: number;
}): { totalFillableMl: number; unitsProduced: number; leftoverMl: number } {
  const grams = params.batchKg * 1000;
  const totalFillableMl = grams / params.fillDensityGPerMl;
  const unitsProduced = Math.floor(totalFillableMl / params.packNetContentMl);
  const leftoverMl = totalFillableMl - unitsProduced * params.packNetContentMl;

  return { totalFillableMl, unitsProduced, leftoverMl };
}

/* ------------------------------------------------------------------ */
/*  B) Set pack spec on a product                                      */
/* ------------------------------------------------------------------ */

export async function setProductPackSpec(
  productId: string,
  packNetContentMl: number,
  fillDensityGPerMl: number,
  actorUserId: string,
  requestId: string,
): Promise<void> {
  if (!Number.isInteger(packNetContentMl) || packNetContentMl <= 0) {
    throw new Error("INVALID_PACK_CONTENT");
  }
  if (fillDensityGPerMl <= 0 || fillDensityGPerMl > 2.0) {
    throw new Error("INVALID_DENSITY");
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) {
    throw new Error("PRODUCT_NOT_FOUND");
  }

  await prisma.product.update({
    where: { id: productId },
    data: { packNetContentMl, fillDensityGPerMl },
  });

  await writeAuditLog({
    actorUserId,
    action: "PRODUCT_PACK_SPEC_UPDATED",
    entityType: "product",
    entityId: productId,
    requestId,
    metadata: { packNetContentMl, fillDensityGPerMl },
  });

  logger.info({
    event: "pack_spec_updated",
    productId,
    packNetContentMl,
    fillDensityGPerMl,
  });
}

/* ------------------------------------------------------------------ */
/*  C) Create finished good lot for a released batch                   */
/* ------------------------------------------------------------------ */

export async function createFinishedGoodLotForBatch(
  batchId: string,
  actorUserId: string,
  requestId: string,
) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      status: true,
      productionQuantityKg: true,
      productId: true,
      product: {
        select: {
          id: true,
          packNetContentMl: true,
          fillDensityGPerMl: true,
        },
      },
    },
  });

  if (!batch) {
    throw new Error("BATCH_NOT_FOUND");
  }
  if (batch.status !== "RELEASED") {
    throw new Error("BATCH_NOT_RELEASED");
  }
  if (!batch.product.packNetContentMl || batch.product.packNetContentMl <= 0) {
    throw new Error("PACK_SPEC_NOT_SET");
  }
  if (batch.product.fillDensityGPerMl <= 0) {
    throw new Error("INVALID_DENSITY");
  }

  const { totalFillableMl, unitsProduced, leftoverMl } =
    computeFinishedGoodsFromBatchKg({
      batchKg: batch.productionQuantityKg,
      packNetContentMl: batch.product.packNetContentMl,
      fillDensityGPerMl: batch.product.fillDensityGPerMl,
    });

  const fgLot = await prisma.$transaction(async (tx) => {
    // Guard: one FG lot per batch
    const existing = await tx.finishedGoodLot.findUnique({
      where: { batchId },
    });
    if (existing) {
      throw new Error("FG_LOT_ALREADY_EXISTS");
    }

    return tx.finishedGoodLot.create({
      data: {
        productId: batch.productId,
        batchId,
        unitsProduced,
        unitsRemaining: unitsProduced,
        packNetContentMl: batch.product.packNetContentMl!,
        fillDensityGPerMl: batch.product.fillDensityGPerMl,
        totalFillableMl,
        leftoverMl,
        status: unitsProduced > 0 ? "AVAILABLE" : "EXHAUSTED",
        createdByUserId: actorUserId,
      },
    });
  });

  await writeAuditLog({
    actorUserId,
    action: "FINISHED_GOODS_CREATED",
    entityType: "finished_good_lot",
    entityId: fgLot.id,
    requestId,
    metadata: {
      batchId,
      productId: batch.productId,
      unitsProduced,
      leftoverMl,
      totalFillableMl,
    },
  });

  logger.info({
    event: "finished_goods_created",
    fgLotId: fgLot.id,
    batchId,
    unitsProduced,
    leftoverMl,
  });

  return fgLot;
}
