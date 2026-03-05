import { prisma } from "../prisma.js";
import type { RegionCode } from "@prisma/client";
import type { SaveLabelBody } from "./labels.types.js";

/**
 * List label versions for a product + region, newest first.
 */
export async function listLabels(productId: string, region: RegionCode) {
  return prisma.labelMetadata.findMany({
    where: { productId, region },
    orderBy: { versionNumber: "desc" },
    include: {
      createdBy: { select: { id: true, fullName: true } },
    },
  });
}

/**
 * Save a new label version. Auto-increments versionNumber.
 * Sets new label as active, deactivates previous active.
 */
export async function saveLabel(
  productId: string,
  body: SaveLabelBody,
  userId: string,
) {
  const region = body.region as RegionCode;

  return prisma.$transaction(async (tx) => {
    // Get next version number
    const latest = await tx.labelMetadata.findFirst({
      where: { productId, region },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    const nextVersion = (latest?.versionNumber ?? 0) + 1;

    // Deactivate previous active
    await tx.labelMetadata.updateMany({
      where: { productId, region, isActive: true },
      data: { isActive: false },
    });

    // Create new version as active
    return tx.labelMetadata.create({
      data: {
        productId,
        region,
        versionNumber: nextVersion,
        isActive: true,
        productName: body.productName,
        netQuantity: body.netQuantity,
        inciDeclaration: body.inciDeclaration,
        warnings: body.warnings ?? null,
        manufacturerName: body.manufacturerName ?? null,
        manufacturerAddress: body.manufacturerAddress ?? null,
        batchFormat: body.batchFormat ?? null,
        mfgDate: body.mfgDate ? new Date(body.mfgDate) : null,
        expDate: body.expDate ? new Date(body.expDate) : null,
        createdByUserId: userId,
      },
      include: {
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  });
}

/**
 * Activate a specific label version. Deactivates others for same product+region.
 */
export async function activateLabel(labelId: string) {
  const label = await prisma.labelMetadata.findUnique({
    where: { id: labelId },
    select: { id: true, productId: true, region: true },
  });

  if (!label) throw new Error("Label not found");

  await prisma.$transaction([
    prisma.labelMetadata.updateMany({
      where: { productId: label.productId, region: label.region, isActive: true },
      data: { isActive: false },
    }),
    prisma.labelMetadata.update({
      where: { id: labelId },
      data: { isActive: true },
    }),
  ]);

  return prisma.labelMetadata.findUnique({
    where: { id: labelId },
    include: {
      createdBy: { select: { id: true, fullName: true } },
    },
  });
}
