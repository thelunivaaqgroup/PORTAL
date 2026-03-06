import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { markExpiredLots } from "../inventory/inventory.service.js";
import type { AlertType } from "@prisma/client";

const LOW_STOCK_DEFAULT_KG = 5;
const EXPIRY_WINDOW_DAYS = 30;

/* ------------------------------------------------------------------ */
/*  Idempotent upsert                                                  */
/* ------------------------------------------------------------------ */

async function upsertAlert(params: {
  dedupeKey: string;
  type: AlertType;
  title: string;
  message: string;
  ingredientId?: string;
  lotId?: string;
  productId?: string;
  documentId?: string;
}): Promise<void> {
  const existing = await prisma.systemAlert.findUnique({
    where: { dedupeKey: params.dedupeKey },
  });

  if (existing) {
    // Already resolved — do not re-open
    if (existing.status === "RESOLVED") return;

    // Already active — update title/message
    await prisma.systemAlert.update({
      where: { id: existing.id },
      data: { title: params.title, message: params.message },
    });
    return;
  }

  // Create new ACTIVE alert
  await prisma.systemAlert.create({
    data: {
      dedupeKey: params.dedupeKey,
      type: params.type,
      status: "ACTIVE",
      title: params.title,
      message: params.message,
      ingredientId: params.ingredientId,
      lotId: params.lotId,
      productId: params.productId,
      documentId: params.documentId,
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Inventory alerts                                                   */
/* ------------------------------------------------------------------ */

export async function computeInventoryAlerts(): Promise<void> {
  // Mark expired lots first
  await markExpiredLots();

  // ── LOW_STOCK ──
  const ingredients = await prisma.ingredientMaster.findMany({
    select: { id: true, inciName: true, lowStockThresholdKg: true },
  });

  for (const ing of ingredients) {
    const threshold = ing.lowStockThresholdKg ?? LOW_STOCK_DEFAULT_KG;

    const agg = await prisma.rawMaterialLot.aggregate({
      where: { ingredientId: ing.id, status: "AVAILABLE" },
      _sum: { quantityRemainingKg: true },
    });

    const totalAvailable = agg._sum.quantityRemainingKg ?? 0;

    if (totalAvailable <= threshold) {
      await upsertAlert({
        dedupeKey: `LOW_STOCK:${ing.id}`,
        type: "LOW_STOCK",
        title: `Low stock: ${ing.inciName}`,
        message: `Available ${totalAvailable.toFixed(2)} kg (threshold ${threshold} kg)`,
        ingredientId: ing.id,
      });
    }
  }

  // ── LOT_EXPIRING_SOON ──
  const now = new Date();
  const windowEnd = new Date(now.getTime() + EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const expiringSoonLots = await prisma.rawMaterialLot.findMany({
    where: {
      status: "AVAILABLE",
      expiryDate: { not: null, gte: now, lte: windowEnd },
    },
    include: { ingredient: { select: { inciName: true } } },
  });

  for (const lot of expiringSoonLots) {
    const daysLeft = Math.ceil(
      (new Date(lot.expiryDate!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    await upsertAlert({
      dedupeKey: `LOT_EXP_SOON:${lot.id}`,
      type: "LOT_EXPIRING_SOON",
      title: `Lot expiring soon: ${lot.ingredient.inciName}`,
      message: `Lot ${lot.supplierLotNumber} from ${lot.supplierName} expires in ${daysLeft} day(s)`,
      ingredientId: lot.ingredientId,
      lotId: lot.id,
    });
  }

  // ── LOT_EXPIRED ──
  const expiredLots = await prisma.rawMaterialLot.findMany({
    where: { status: "EXPIRED" },
    include: { ingredient: { select: { inciName: true } } },
  });

  for (const lot of expiredLots) {
    await upsertAlert({
      dedupeKey: `LOT_EXPIRED:${lot.id}`,
      type: "LOT_EXPIRED",
      title: `Lot expired: ${lot.ingredient.inciName}`,
      message: `Lot ${lot.supplierLotNumber} from ${lot.supplierName} has expired`,
      ingredientId: lot.ingredientId,
      lotId: lot.id,
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Document expiry alerts                                             */
/* ------------------------------------------------------------------ */

export async function computeDocumentExpiryAlerts(): Promise<void> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // DOC_EXPIRED
  const expiredDocs = await prisma.productDocument.findMany({
    where: { expiryDate: { not: null, lt: now } },
    select: { id: true, productId: true, type: true, originalFilename: true, expiryDate: true },
  });

  for (const doc of expiredDocs) {
    await upsertAlert({
      dedupeKey: `DOC_EXPIRED:${doc.id}`,
      type: "DOC_EXPIRED",
      title: `Document expired: ${doc.type}`,
      message: `${doc.originalFilename} expired on ${doc.expiryDate!.toISOString().slice(0, 10)}`,
      productId: doc.productId,
      documentId: doc.id,
    });
  }

  // DOC_EXPIRING_SOON
  const expiringSoonDocs = await prisma.productDocument.findMany({
    where: { expiryDate: { not: null, gte: now, lte: windowEnd } },
    select: { id: true, productId: true, type: true, originalFilename: true, expiryDate: true },
  });

  for (const doc of expiringSoonDocs) {
    const daysLeft = Math.ceil(
      (new Date(doc.expiryDate!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    await upsertAlert({
      dedupeKey: `DOC_EXP_SOON:${doc.id}`,
      type: "DOC_EXPIRING_SOON",
      title: `Document expiring soon: ${doc.type}`,
      message: `${doc.originalFilename} expires in ${daysLeft} day(s)`,
      productId: doc.productId,
      documentId: doc.id,
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Auto READY_FOR_SALE                                                */
/* ------------------------------------------------------------------ */

export async function recomputeReadyForSaleForProduct(productId: string): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, stage: true },
  });

  if (!product) return;

  // Never downgrade — only advance TO READY_FOR_SALE
  const alreadyBeyond = [
    "READY_FOR_SALE", "LIVE", "DISCONTINUED",
  ].includes(product.stage);
  if (alreadyBeyond) return;

  // Check for any RELEASED batch
  const releasedBatch = await prisma.batch.findFirst({
    where: { productId, status: "RELEASED" },
    select: { id: true },
  });

  if (!releasedBatch) return;

  await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { stage: "READY_FOR_SALE" },
    }),
    prisma.productStageEvent.create({
      data: {
        productId,
        fromStage: product.stage,
        toStage: "READY_FOR_SALE",
        reason: "auto:batch_released",
        createdByUserId: "system",
      },
    }),
  ]);

  logger.info({ event: "product_stage_ready_for_sale", productId });
}

/* ------------------------------------------------------------------ */
/*  Compliance failure alert (called from eligibility service)        */
/* ------------------------------------------------------------------ */

export async function upsertComplianceFailureAlert(params: {
  productId: string;
  requestId: string;
  message: string;
}): Promise<void> {
  const dedupeKey = `COMPLIANCE_FAILURE:${params.requestId}`;
  await upsertAlert({
    dedupeKey,
    type: "COMPLIANCE_FAILURE",
    title: "Compliance validation failed",
    message: params.message,
    productId: params.productId,
  });
}

/* ------------------------------------------------------------------ */
/*  Stage delay alerts (product stuck at stage beyond SLA)           */
/* ------------------------------------------------------------------ */

const STAGE_DELAY_SLA_DAYS = 14;
const STAGE_DELAY_TRACKED_STAGES: Array<"R_AND_D" | "COMPLIANCE_READY" | "PACKAGING_READY"> = [
  "R_AND_D",
  "COMPLIANCE_READY",
  "PACKAGING_READY",
];

export async function computeStageDelayAlerts(): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - STAGE_DELAY_SLA_DAYS * 24 * 60 * 60 * 1000);

  const products = await prisma.product.findMany({
    where: { stage: { in: STAGE_DELAY_TRACKED_STAGES } },
    select: { id: true, name: true, skuCode: true, stage: true },
  });

  for (const product of products) {
    const latestEntry = await prisma.productStageEvent.findFirst({
      where: { productId: product.id, toStage: product.stage },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (!latestEntry || latestEntry.createdAt > cutoff) continue;

    const daysStuck = Math.floor(
      (now.getTime() - latestEntry.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    await upsertAlert({
      dedupeKey: `STAGE_DELAY:${product.id}`,
      type: "STAGE_DELAY",
      title: `Stage delay: ${product.name || product.skuCode}`,
      message: `Product at ${product.stage} for ${daysStuck} day(s) (SLA: ${STAGE_DELAY_SLA_DAYS} days)`,
      productId: product.id,
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Full sweep                                                         */
/* ------------------------------------------------------------------ */

export async function runAlertsAndStageSweep(): Promise<void> {
  await computeInventoryAlerts();
  await computeDocumentExpiryAlerts();
  await computeStageDelayAlerts();

  // Auto READY_FOR_SALE for products with released batches
  const productsWithReleasedBatches = await prisma.batch.findMany({
    where: { status: "RELEASED" },
    select: { productId: true },
    distinct: ["productId"],
  });

  for (const { productId } of productsWithReleasedBatches) {
    await recomputeReadyForSaleForProduct(productId);
  }
}
