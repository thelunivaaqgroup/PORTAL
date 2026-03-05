import { prisma } from "../prisma.js";
import { calculateMaxProducibleKg, consumeStockFIFO } from "../inventory/inventory.service.js";

/**
 * Create a new production batch for a product.
 *
 * Validates:
 * - Product stage must be MANUFACTURING_APPROVED
 * - productionQuantityKg must not exceed max producible
 *
 * Inside a transaction:
 * - Consumes stock FIFO for each formulation ingredient
 * - Generates batch number: {skuCode}-{paddedSeq}
 * - Creates Batch + BatchConsumption records
 * - Advances product stage to BATCH_CREATED
 */
export async function createBatch({
  productId,
  productionQuantityKg,
  createdByUserId,
}: {
  productId: string;
  productionQuantityKg: number;
  createdByUserId: string;
}) {
  // Load product with active formulation
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      stage: true,
      skuCode: true,
      activeFormulationId: true,
      latestUploadId: true,
    },
  });

  if (!product) throw new Error("PRODUCT_NOT_FOUND");
  if (product.stage !== "MANUFACTURING_APPROVED") throw new Error("INVALID_STAGE");
  if (!product.latestUploadId) throw new Error("NO_UPLOAD_FOUND");
  if (!product.activeFormulationId) throw new Error("NO_ACTIVE_FORMULATION");

  // Get matched rows with percentages from the latest upload
  const rows = await prisma.formulationUploadRow.findMany({
    where: {
      uploadId: product.latestUploadId,
      matchedIngredientId: { not: null },
      detectedPct: { not: null, gt: 0 },
    },
    select: {
      matchedIngredientId: true,
      detectedPct: true,
    },
  });

  if (rows.length === 0) throw new Error("NO_INGREDIENTS_FOUND");

  // Aggregate percentage per ingredient
  const ingredientPct = new Map<string, number>();
  for (const row of rows) {
    const id = row.matchedIngredientId!;
    const pct = row.detectedPct!;
    ingredientPct.set(id, (ingredientPct.get(id) ?? 0) + pct);
  }

  // Verify max producible
  const maxProducible = await calculateMaxProducibleKg(product.activeFormulationId);
  if (productionQuantityKg > maxProducible) {
    throw new Error("EXCEEDS_MAX_PRODUCTION");
  }

  // Get active label version (latest active for any region)
  const activeLabel = await prisma.labelMetadata.findFirst({
    where: { productId, isActive: true },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!activeLabel) throw new Error("NO_ACTIVE_LABEL");

  // Get the formulation's current version
  const formulation = await prisma.formulation.findUnique({
    where: { id: product.activeFormulationId },
    select: { currentVersionId: true },
  });

  if (!formulation?.currentVersionId) throw new Error("NO_FORMULATION_VERSION");

  // Execute everything inside a transaction
  return prisma.$transaction(async (tx) => {
    // Consume stock for each ingredient
    const allConsumptions: Array<{ rawMaterialLotId: string; quantityConsumedKg: number }> = [];

    for (const [ingredientId, pct] of ingredientPct) {
      const requiredKg = productionQuantityKg * (pct / 100);
      const consumptions = await consumeStockFIFO(tx, ingredientId, requiredKg);
      allConsumptions.push(...consumptions);
    }

    // Generate batch number: {skuCode}-{paddedSeq}
    const batchCount = await tx.batch.count({ where: { productId } });
    const nextNumber = String(batchCount + 1).padStart(4, "0");
    const batchNumber = `${product.skuCode}-${nextNumber}`;

    // Manufacturing date = now, expiry = +24 months
    const manufacturingDate = new Date();
    const expiryDate = new Date(manufacturingDate);
    expiryDate.setMonth(expiryDate.getMonth() + 24);

    // Create batch
    const batch = await tx.batch.create({
      data: {
        productId,
        batchNumber,
        productionQuantityKg,
        manufacturingDate,
        expiryDate,
        status: "CREATED",
        formulationVersionId: formulation.currentVersionId!,
        labelVersionId: activeLabel.id,
        createdByUserId,
      },
    });

    // Create consumption records
    for (const c of allConsumptions) {
      await tx.batchConsumption.create({
        data: {
          batchId: batch.id,
          rawMaterialLotId: c.rawMaterialLotId,
          quantityConsumedKg: c.quantityConsumedKg,
        },
      });
    }

    // Advance product stage to BATCH_CREATED
    await tx.product.update({
      where: { id: productId },
      data: { stage: "BATCH_CREATED" },
    });

    await tx.productStageEvent.create({
      data: {
        productId,
        fromStage: "MANUFACTURING_APPROVED",
        toStage: "BATCH_CREATED",
        reason: `Batch ${batchNumber} created`,
        createdByUserId,
      },
    });

    // Return batch with consumptions
    return tx.batch.findUnique({
      where: { id: batch.id },
      include: {
        consumptions: {
          include: {
            rawMaterialLot: {
              select: {
                id: true,
                supplierName: true,
                supplierLotNumber: true,
                ingredient: { select: { id: true, inciName: true } },
              },
            },
          },
        },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  });
}
