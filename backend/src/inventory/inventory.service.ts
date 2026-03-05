import { prisma } from "../prisma.js";
import type { PrismaClient } from "@prisma/client";

type TxClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * Mark lots that have passed their expiry date as EXPIRED.
 * Only targets lots currently AVAILABLE with a non-null expiryDate in the past.
 */
export async function markExpiredLots(): Promise<number> {
  const result = await prisma.rawMaterialLot.updateMany({
    where: {
      status: "AVAILABLE",
      expiryDate: { not: null, lt: new Date() },
    },
    data: { status: "EXPIRED" },
  });
  return result.count;
}

/**
 * Get available lots for an ingredient, FIFO order (oldest first).
 * Auto-marks expired lots before querying.
 */
export async function getAvailableLotsForIngredient(ingredientId: string) {
  await markExpiredLots();

  return prisma.rawMaterialLot.findMany({
    where: {
      ingredientId,
      status: "AVAILABLE",
      quantityRemainingKg: { gt: 0 },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Calculate the maximum producible quantity (in kg) given current stock levels
 * for all ingredients in a formulation.
 *
 * Uses the latest upload rows of the active formulation to determine
 * ingredient percentages. Returns the minimum across all ingredients.
 */
export async function calculateMaxProducibleKg(
  formulationId: string,
): Promise<number> {
  await markExpiredLots();

  // Get latest upload for this formulation
  const latestUpload = await prisma.formulationUpload.findFirst({
    where: { formulationId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!latestUpload) return 0;

  return calculateMaxProducibleFromUpload(latestUpload.id);
}

/**
 * Calculate max producible from a specific upload's rows.
 */
async function calculateMaxProducibleFromUpload(uploadId: string): Promise<number> {
  // Get matched rows with percentages
  const rows = await prisma.formulationUploadRow.findMany({
    where: {
      uploadId,
      matchedIngredientId: { not: null },
      detectedPct: { not: null, gt: 0 },
    },
    select: {
      matchedIngredientId: true,
      detectedPct: true,
    },
  });

  if (rows.length === 0) return 0;

  // Aggregate percentage per ingredient (in case of duplicate rows)
  const ingredientPct = new Map<string, number>();
  for (const row of rows) {
    const id = row.matchedIngredientId!;
    const pct = row.detectedPct!;
    ingredientPct.set(id, (ingredientPct.get(id) ?? 0) + pct);
  }

  let minProducible = Infinity;

  for (const [ingredientId, pct] of ingredientPct) {
    if (pct <= 0) continue;

    // Sum available stock for this ingredient
    const agg = await prisma.rawMaterialLot.aggregate({
      where: {
        ingredientId,
        status: "AVAILABLE",
        quantityRemainingKg: { gt: 0 },
      },
      _sum: { quantityRemainingKg: true },
    });

    const totalAvailableKg = agg._sum.quantityRemainingKg ?? 0;

    if (totalAvailableKg === 0) return 0;

    const maxForIngredient = totalAvailableKg / (pct / 100);
    minProducible = Math.min(minProducible, maxForIngredient);
  }

  return minProducible === Infinity ? 0 : Math.floor(minProducible * 1000) / 1000;
}

/**
 * Calculate max producible for a product using its latestUploadId.
 */
export async function calculateMaxProducibleKgByProduct(
  productId: string,
): Promise<number> {
  await markExpiredLots();

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { latestUploadId: true },
  });

  if (!product?.latestUploadId) return 0;

  return calculateMaxProducibleFromUpload(product.latestUploadId);
}

/**
 * Consume stock from available lots in FIFO order (oldest first) within a transaction.
 *
 * @throws Error("INSUFFICIENT_STOCK") if not enough stock available.
 * @returns Array of consumption entries to create as BatchConsumption records.
 */
export async function consumeStockFIFO(
  tx: TxClient,
  ingredientId: string,
  requiredKg: number,
): Promise<Array<{ rawMaterialLotId: string; quantityConsumedKg: number }>> {
  // Fetch available lots FIFO
  const lots = await tx.rawMaterialLot.findMany({
    where: {
      ingredientId,
      status: "AVAILABLE",
      quantityRemainingKg: { gt: 0 },
    },
    orderBy: { createdAt: "asc" },
  });

  const totalAvailable = lots.reduce((sum, lot) => sum + lot.quantityRemainingKg, 0);

  if (totalAvailable < requiredKg) {
    throw new Error("INSUFFICIENT_STOCK");
  }

  const consumptions: Array<{ rawMaterialLotId: string; quantityConsumedKg: number }> = [];
  let remaining = requiredKg;

  for (const lot of lots) {
    if (remaining <= 0) break;

    const consume = Math.min(lot.quantityRemainingKg, remaining);

    await tx.rawMaterialLot.update({
      where: { id: lot.id },
      data: { quantityRemainingKg: lot.quantityRemainingKg - consume },
    });

    consumptions.push({
      rawMaterialLotId: lot.id,
      quantityConsumedKg: consume,
    });

    remaining -= consume;
  }

  return consumptions;
}
