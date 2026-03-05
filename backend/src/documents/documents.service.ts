import { prisma } from "../prisma.js";
import { saveUploadedFile } from "../storage/fileStorage.service.js";
import type { ProductDocumentType } from "@prisma/client";

/**
 * List all documents for a product, newest first, grouped by type.
 */
export async function listDocuments(productId: string) {
  return prisma.productDocument.findMany({
    where: { productId },
    orderBy: [{ type: "asc" }, { versionNumber: "desc" }],
    include: {
      createdBy: { select: { id: true, fullName: true } },
    },
  });
}

/**
 * Upload a new document version for a product+type.
 * Auto-increments versionNumber.
 */
export async function uploadDocument(
  productId: string,
  type: ProductDocumentType,
  file: { buffer: Buffer; originalname: string; mimetype: string },
  opts: { issueDate?: string; expiryDate?: string; notes?: string },
  userId: string,
) {
  // Save file to disk
  const stored = await saveUploadedFile(file.buffer, file.originalname);

  // Get next version number
  const latest = await prisma.productDocument.findFirst({
    where: { productId, type },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  const nextVersion = (latest?.versionNumber ?? 0) + 1;

  return prisma.productDocument.create({
    data: {
      productId,
      type,
      versionNumber: nextVersion,
      originalFilename: file.originalname,
      storedFilename: stored.storedFilename,
      mimeType: file.mimetype,
      sizeBytes: stored.sizeBytes,
      filePath: stored.filePath,
      issueDate: opts.issueDate ? new Date(opts.issueDate) : null,
      expiryDate: opts.expiryDate ? new Date(opts.expiryDate) : null,
      notes: opts.notes ?? null,
      createdByUserId: userId,
    },
    include: {
      createdBy: { select: { id: true, fullName: true } },
    },
  });
}

/**
 * Get a single document by ID.
 */
export async function getDocumentById(docId: string) {
  return prisma.productDocument.findUnique({
    where: { id: docId },
  });
}

/**
 * Get the latest version of each required doc type for a product.
 * Used by the stage gate check.
 */
export async function getLatestRequiredDocs(productId: string) {
  const types: ProductDocumentType[] = ["COA", "SDS", "STABILITY_REPORT", "MICROBIAL_REPORT"];
  const result: Record<string, { expiryDate: Date | null; versionNumber: number } | null> = {};

  for (const type of types) {
    const doc = await prisma.productDocument.findFirst({
      where: { productId, type },
      orderBy: { versionNumber: "desc" },
      select: { expiryDate: true, versionNumber: true },
    });
    result[type] = doc ?? null;
  }

  return result;
}
