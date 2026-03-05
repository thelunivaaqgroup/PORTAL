import { prisma } from "../prisma.js";
import type { RegionCode } from "@prisma/client";
import type { LabelValidationResult } from "./labels.types.js";

const NET_QTY_REGEX = /^Net\s+\d+(\.\d+)?\s*(ml|g)$/i;

/**
 * Validate label metadata for a given product + region.
 * Reads the active label and applies region-specific rules.
 */
export async function validateLabel(
  productId: string,
  region: RegionCode,
): Promise<LabelValidationResult> {
  const errors: string[] = [];

  // Find active label for this product + region
  const label = await prisma.labelMetadata.findFirst({
    where: { productId, region, isActive: true },
  });

  if (!label) {
    return { isValid: false, errors: ["No active label found for this region"] };
  }

  // Common validations
  if (!label.productName.trim()) {
    errors.push("Product name is required");
  }
  if (!NET_QTY_REGEX.test(label.netQuantity.trim())) {
    errors.push("Net quantity must match format: Net <number> ml|g (e.g. \"Net 50 ml\")");
  }
  if (!label.inciDeclaration.trim()) {
    errors.push("INCI declaration is required");
  }

  // Region-specific validations
  if (region === "IN") {
    // India: if both dates present, expDate must be after mfgDate
    if (label.mfgDate && label.expDate) {
      if (label.expDate <= label.mfgDate) {
        errors.push("Expiry date must be after manufacturing date");
      }
    }
  }

  if (region === "AU") {
    // AU: check if warnings are required based on fragrance/parfum in latest upload rows
    const warningsRequired = await checkWarningsRequired(productId);
    if (warningsRequired && !label.warnings?.trim()) {
      errors.push("Warnings are required because the formulation contains fragrance/parfum ingredients");
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Check if warnings are required for AU labels.
 * Returns true if any upload row name contains "fragrance" or "parfum".
 */
async function checkWarningsRequired(productId: string): Promise<boolean> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { latestUploadId: true },
  });

  if (!product?.latestUploadId) return false;

  const fragranceRow = await prisma.formulationUploadRow.findFirst({
    where: {
      uploadId: product.latestUploadId,
      OR: [
        { rawName: { contains: "fragrance", mode: "insensitive" } },
        { rawName: { contains: "parfum", mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });

  return !!fragranceRow;
}
