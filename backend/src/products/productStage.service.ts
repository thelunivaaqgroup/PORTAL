import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { validateLabel } from "../labels/labelValidation.service.js";
import { getLatestRequiredDocs } from "../documents/documents.service.js";
import { EXPIRY_REQUIRED_TYPES } from "../documents/documents.types.js";
import type { ProductStage, RegionCode } from "@prisma/client";

/**
 * Recompute the stage for a product based on current state.
 * Rules:
 * 0) PRE_LIFECYCLE → IDEA → R_AND_D when latestUploadId is set
 * 1) No latestUploadId → PRE_LIFECYCLE (or stay at current if already past IDEA)
 * 2) latestUploadId set → at least R_AND_D
 * 3) COMPLIANCE_READY requires ALL of:
 *    a) All targetRegions have PASS compliance snapshot for latest upload
 *    b) No unmatched rows in latest upload (all rows have matchedIngredientId)
 *    c) Active labels exist and validate for IN and AU
 * 4) PACKAGING_READY requires COMPLIANCE_READY AND:
 *    a) All 4 required doc types exist (COA, SDS, STABILITY_REPORT, MICROBIAL_REPORT)
 *    b) COA/SDS expiryDate exists and >= now
 *    c) Reports: if expiryDate exists, must be >= now
 *
 * Auto-advances: PRE_LIFECYCLE → IDEA → R_AND_D → COMPLIANCE_READY → PACKAGING_READY.
 * Never auto-downgrades past PACKAGING_READY.
 * Products at IDEA or beyond never revert to PRE_LIFECYCLE.
 */
export async function recomputeProductStage(
  productId: string,
  actorUserId: string,
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      stage: true,
      activeFormulationId: true,
      latestUploadId: true,
      targetRegions: true,
    },
  });

  if (!product) return;

  // Don't auto-downgrade stages beyond PACKAGING_READY
  const manualStages: ProductStage[] = [
    "MANUFACTURING_APPROVED",
    "BATCH_CREATED",
    "BATCH_RELEASED",
    "READY_FOR_SALE",
    "LIVE",
    "DISCONTINUED",
  ];
  if (manualStages.includes(product.stage)) return;

  // Products at IDEA or beyond should never revert to PRE_LIFECYCLE
  const beyondPreLifecycle: ProductStage[] = [
    "IDEA",
    "R_AND_D",
    "COMPLIANCE_READY",
    "PACKAGING_READY",
  ];

  let newStage: ProductStage = beyondPreLifecycle.includes(product.stage)
    ? "IDEA"
    : "PRE_LIFECYCLE";

  if (product.latestUploadId) {
    // Gate satisfied: latest upload exists → at least R_AND_D
    newStage = "R_AND_D";

    // Check strict COMPLIANCE_READY gating
    if (product.targetRegions.length > 0) {
      // (a) All targetRegions must have PASS compliance snapshot
      const snapshots = await prisma.uploadComplianceSnapshot.findMany({
        where: { uploadId: product.latestUploadId },
        select: { region: true, status: true },
      });
      const snapshotMap = new Map(snapshots.map((s) => [s.region, s.status]));
      const allPass = product.targetRegions.every(
        (region) => snapshotMap.get(region) === "PASS",
      );

      // (b) No unmatched rows in latest upload
      const unmatchedCount = await prisma.formulationUploadRow.count({
        where: {
          uploadId: product.latestUploadId,
          matchedIngredientId: null,
        },
      });

      // (c) Active labels exist and validate for IN and AU
      const requiredRegions: RegionCode[] = ["IN", "AU"];
      let allLabelsValid = true;
      for (const region of requiredRegions) {
        const result = await validateLabel(productId, region);
        if (!result.isValid) {
          allLabelsValid = false;
          break;
        }
      }

      if (allPass && unmatchedCount === 0 && allLabelsValid) {
        newStage = "COMPLIANCE_READY";

        // Check PACKAGING_READY gate: all 4 required doc types present + valid expiry
        const requiredDocs = await getLatestRequiredDocs(productId);
        const now = new Date();
        let allDocsValid = true;

        for (const [type, doc] of Object.entries(requiredDocs)) {
          if (!doc) {
            allDocsValid = false;
            break;
          }
          // COA/SDS: expiryDate required and must be >= now
          if ((EXPIRY_REQUIRED_TYPES as readonly string[]).includes(type)) {
            if (!doc.expiryDate || doc.expiryDate < now) {
              allDocsValid = false;
              break;
            }
          } else {
            // Reports: if expiryDate exists, must be >= now
            if (doc.expiryDate && doc.expiryDate < now) {
              allDocsValid = false;
              break;
            }
          }
        }

        if (allDocsValid) {
          newStage = "PACKAGING_READY";
        }
      }
    }
  }

  // Don't auto-downgrade from PACKAGING_READY once reached
  if (product.stage === "PACKAGING_READY" && newStage !== "PACKAGING_READY") {
    return;
  }

  // Only update if stage actually changed
  if (newStage === product.stage) return;

  await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { stage: newStage },
    }),
    prisma.productStageEvent.create({
      data: {
        productId,
        fromStage: product.stage,
        toStage: newStage,
        reason: "auto",
        createdByUserId: actorUserId,
      },
    }),
  ]);

  logger.info({
    event: "product_stage_changed",
    productId,
    from: product.stage,
    to: newStage,
  });
}

/**
 * Recompute stage for a specific product by ID.
 */
export async function recomputeStageForProduct(
  productId: string,
  actorUserId: string,
): Promise<void> {
  await recomputeProductStage(productId, actorUserId);
}

/**
 * Find all products that have the given formulation as active,
 * and recompute their stage.
 */
export async function recomputeStageForFormulation(
  formulationId: string,
  actorUserId: string,
): Promise<void> {
  const products = await prisma.product.findMany({
    where: { activeFormulationId: formulationId },
    select: { id: true },
  });

  for (const p of products) {
    await recomputeProductStage(p.id, actorUserId);
  }
}
