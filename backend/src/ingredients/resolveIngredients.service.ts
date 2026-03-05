import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { normalizeCas, lookupCasDetail } from "../services/commonChemistry.js";
import type { IngredientType } from "@prisma/client";

// ── Types ──

export type UnmatchedRow = {
  id: string;
  rawName: string;
  casNumber: string | null;
  inciSuggestion: string | null;
  detectedPct: number | null;
  ingredientType: IngredientType | null;
  inferredCategory: string;
  evidenceDocs: { id: string; fileName: string; docType: string; createdAt: string }[];
};

export type ResolvePayload = {
  requestId: string;
  uploadRowId: string;
  ingredientMasterId?: string;
  createPayload?: {
    inciName: string;
    casNumber?: string | null;
    synonyms?: string[];
  };
  addSynonym?: boolean;
  ingredientType: IngredientType;
  casNumber?: string | null;
  evidenceDocIds?: string[];
};

export type ResolveResult = {
  uploadRowId: string;
  matchedIngredientId: string;
  matchedInciName: string;
  ingredientType: IngredientType;
  synonymAdded: boolean;
  evidenceDocsLinked: number;
};

// ── Botanical / Blend / Polymer detection (mirrored from eligibility service) ──

const BOTANICAL_PATTERNS = [
  /\bextract\b/i, /\bextractum\b/i, /\bhydrosol\b/i, /\bessential\s+oil\b/i,
  /\bbotanical\b/i, /\bphyto/i, /\bferment\b/i, /\bfiltrate\b/i, /\blysate\b/i,
  /\bhydrolyzed\b/i, /\bsaponified\b/i,
  /\b(?:flower|leaf|root|bark|seed|fruit|herb|plant)\s+(?:extract|oil|water|powder)\b/i,
];

const BLEND_PATTERNS = [
  /\bblend\b/i, /\bcomplex\b/i, /\bproprietary\b/i, /\bfragrance\b/i,
  /\bperfume\b/i, /\bparfum\b/i, /\baroma\b/i, /\bcomposition\b/i,
];

const POLYMER_PATTERNS = [
  /\bpolymer\b/i, /\bcopolymer\b/i, /\bcrosspolymer\b/i, /\bpolysorbate\b/i,
  /\bdimethicone\b/i, /\bcarbomer\b/i, /\bacrylat/i, /\bpeg-\d/i, /\bppg-\d/i,
  /\bsilicone\b/i,
];

function inferCategory(name: string): string {
  if (BOTANICAL_PATTERNS.some((p) => p.test(name))) return "BOTANICAL";
  if (BLEND_PATTERNS.some((p) => p.test(name))) return "BLEND";
  if (POLYMER_PATTERNS.some((p) => p.test(name))) return "POLYMER";
  return "STANDARD";
}

// ── Service Functions ──

/**
 * Get all unmatched upload rows for a compliance request.
 */
export async function getUnmatchedRows(requestId: string): Promise<UnmatchedRow[]> {
  const request = await prisma.complianceRequest.findUnique({
    where: { id: requestId },
    select: { uploadId: true },
  });
  if (!request) throw new Error("REQUEST_NOT_FOUND");

  const rows = await prisma.formulationUploadRow.findMany({
    where: {
      uploadId: request.uploadId,
      matchedIngredientId: null,
    },
    select: {
      id: true,
      rawName: true,
      casNumber: true,
      inciSuggestion: true,
      detectedPct: true,
      ingredientType: true,
      evidenceDocs: {
        select: { id: true, fileName: true, docType: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { rawName: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    rawName: r.rawName,
    casNumber: r.casNumber,
    inciSuggestion: r.inciSuggestion,
    detectedPct: r.detectedPct,
    ingredientType: r.ingredientType,
    inferredCategory: inferCategory(r.rawName),
    evidenceDocs: r.evidenceDocs.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      docType: d.docType,
      createdAt: d.createdAt.toISOString(),
    })),
  }));
}

/**
 * Search ingredient master records by name fragment (for typeahead).
 */
export async function searchIngredients(query: string, limit = 20) {
  const rows = await prisma.ingredientMaster.findMany({
    where: {
      OR: [
        { inciName: { contains: query, mode: "insensitive" } },
        { casNumber: { contains: query, mode: "insensitive" } },
        { synonyms: { some: { name: { contains: query, mode: "insensitive" } } } },
      ],
    },
    include: { synonyms: { select: { name: true } } },
    take: limit,
    orderBy: { inciName: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    inciName: r.inciName,
    casNumber: r.casNumber,
    synonyms: r.synonyms.map((s) => s.name),
  }));
}

/**
 * Resolve a single unmatched ingredient row.
 */
export async function resolveIngredient(
  userId: string,
  payload: ResolvePayload,
): Promise<ResolveResult> {
  const { requestId, uploadRowId, ingredientMasterId, createPayload, addSynonym, ingredientType, casNumber, evidenceDocIds } = payload;

  // Validate the compliance request exists
  const request = await prisma.complianceRequest.findUnique({
    where: { id: requestId },
    select: { id: true, uploadId: true, status: true },
  });
  if (!request) throw new Error("REQUEST_NOT_FOUND");
  if (request.status === "APPROVED") throw new Error("ALREADY_APPROVED");

  // Validate the upload row exists and is unmatched
  const row = await prisma.formulationUploadRow.findUnique({
    where: { id: uploadRowId },
    select: { id: true, uploadId: true, rawName: true, matchedIngredientId: true },
  });
  if (!row) throw new Error("ROW_NOT_FOUND");
  if (row.uploadId !== request.uploadId) throw new Error("ROW_NOT_IN_REQUEST");

  let masterIngredientId: string;
  let matchedInciName: string;
  let synonymAdded = false;

  let masterCasNumber: string | null = null;

  if (ingredientMasterId) {
    // Use existing IngredientMaster
    const master = await prisma.ingredientMaster.findUnique({
      where: { id: ingredientMasterId },
      select: { id: true, inciName: true, casNumber: true },
    });
    if (!master) throw new Error("INGREDIENT_NOT_FOUND");
    masterIngredientId = master.id;
    matchedInciName = master.inciName;
    masterCasNumber = master.casNumber;
  } else if (createPayload) {
    // Create new IngredientMaster
    const inciName = createPayload.inciName.trim();
    if (!inciName) throw new Error("INCI_NAME_REQUIRED");

    const created = await prisma.$transaction(async (tx) => {
      const master = await tx.ingredientMaster.create({
        data: {
          inciName,
          casNumber: createPayload.casNumber?.trim() || casNumber?.trim() || null,
          createdByUserId: userId,
        },
      });

      // Create supplied synonyms
      const synonyms = createPayload.synonyms?.filter((s) => s.trim()) ?? [];
      if (synonyms.length > 0) {
        await tx.ingredientSynonym.createMany({
          data: synonyms.map((name) => ({
            ingredientId: master.id,
            name: name.trim(),
          })),
        });
      }

      return master;
    });

    masterIngredientId = created.id;
    matchedInciName = created.inciName;

    await writeAuditLog({
      actorUserId: userId,
      action: "INGREDIENT_CREATED_VIA_RESOLVE",
      entityType: "ingredient_master",
      entityId: created.id,
      requestId: `resolve-${requestId}-${Date.now()}`,
      metadata: { inciName, casNumber: created.casNumber, requestId },
    });
  } else {
    throw new Error("MUST_PROVIDE_INGREDIENT_ID_OR_CREATE_PAYLOAD");
  }

  // Add raw name as synonym if requested and not already present
  if (addSynonym !== false) {
    const rawNameTrimmed = row.rawName.trim();
    // Check if synonym already exists
    const existing = await prisma.ingredientSynonym.findFirst({
      where: {
        ingredientId: masterIngredientId,
        name: { equals: rawNameTrimmed, mode: "insensitive" },
      },
    });
    // Also check if rawName equals the inciName itself
    if (!existing && rawNameTrimmed.toLowerCase() !== matchedInciName.toLowerCase()) {
      await prisma.ingredientSynonym.create({
        data: {
          ingredientId: masterIngredientId,
          name: rawNameTrimmed,
        },
      });
      synonymAdded = true;
    }
  }

  // Update the upload row
  await prisma.formulationUploadRow.update({
    where: { id: uploadRowId },
    data: {
      matchedIngredientId: masterIngredientId,
      matchType: "MANUAL_RESOLVE",
      matchConfidence: 1.0,
      ingredientType,
      casNumber: casNumber?.trim() || masterCasNumber || undefined,
      resolvedAt: new Date(),
      resolvedByUserId: userId,
    },
  });

  // Link evidence docs if provided
  let evidenceDocsLinked = 0;
  if (evidenceDocIds && evidenceDocIds.length > 0) {
    // Verify the docs exist and belong to this row
    const docs = await prisma.ingredientEvidenceDoc.findMany({
      where: { id: { in: evidenceDocIds }, uploadRowId },
    });
    evidenceDocsLinked = docs.length;
  }

  // If the master didn't have a CAS number but one was provided, update it
  if (casNumber?.trim()) {
    const master = await prisma.ingredientMaster.findUnique({
      where: { id: masterIngredientId },
      select: { casNumber: true },
    });
    if (!master?.casNumber) {
      await prisma.ingredientMaster.update({
        where: { id: masterIngredientId },
        data: { casNumber: casNumber.trim(), updatedByUserId: userId },
      });
    }
  }

  // Audit log
  await writeAuditLog({
    actorUserId: userId,
    action: "INGREDIENT_RESOLVED",
    entityType: "formulation_upload_row",
    entityId: uploadRowId,
    requestId: `resolve-${requestId}-${Date.now()}`,
    metadata: {
      requestId,
      rawName: row.rawName,
      matchedIngredientId: masterIngredientId,
      matchedInciName,
      ingredientType,
      synonymAdded,
      evidenceDocsLinked,
    },
  });

  logger.info({
    event: "ingredient_resolved",
    uploadRowId,
    rawName: row.rawName,
    matchedIngredientId: masterIngredientId,
    matchedInciName,
    ingredientType,
  });

  return {
    uploadRowId,
    matchedIngredientId: masterIngredientId,
    matchedInciName,
    ingredientType,
    synonymAdded,
    evidenceDocsLinked,
  };
}

/**
 * Upload evidence document for an ingredient row.
 */
export async function uploadEvidenceDoc(
  userId: string,
  uploadRowId: string,
  file: { originalname: string; path: string; mimetype: string; size: number },
  docType: string,
): Promise<{ id: string; fileName: string; docType: string }> {
  // Verify row exists
  const row = await prisma.formulationUploadRow.findUnique({
    where: { id: uploadRowId },
    select: { id: true },
  });
  if (!row) throw new Error("ROW_NOT_FOUND");

  const doc = await prisma.ingredientEvidenceDoc.create({
    data: {
      uploadRowId,
      fileName: file.originalname,
      storagePath: file.path,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      docType: docType || "OTHER",
      createdByUserId: userId,
    },
  });

  return { id: doc.id, fileName: doc.fileName, docType: doc.docType };
}

/**
 * Get all trade name aliases for the matching engine.
 */
export async function getTradeNameAliases() {
  return prisma.tradeNameAlias.findMany({
    orderBy: { tradeName: "asc" },
  });
}

/**
 * Create or update a trade name alias.
 */
export async function upsertTradeNameAlias(
  tradeName: string,
  canonicalInci: string,
  casNumber?: string | null,
) {
  return prisma.tradeNameAlias.upsert({
    where: { tradeName },
    create: { tradeName, canonicalInci, casNumber: casNumber || null },
    update: { canonicalInci, casNumber: casNumber || null },
  });
}

// ── Auto-Resolve ──

export type AutoResolveResult = {
  total: number;
  resolved: number;
  skippedMissingCas: number;
  createdMasters: number;
  errors: { rowId: string; rawName: string; reason: string }[];
};

/**
 * Auto-resolve unmatched ingredients by CAS lookup.
 *
 * For each unmatched row with a CAS number:
 *   1. Try to find an existing IngredientMaster by exact CAS.
 *   2. If not found, look up CAS Common Chemistry for the official name.
 *   3. Create a new IngredientMaster with the official name + resolve.
 *
 * Rows without a CAS number are skipped (left for manual resolution).
 */
export async function autoResolveIngredients(
  userId: string,
  productId: string,
  requestId: string,
  limit = 100,
): Promise<AutoResolveResult> {
  const rows = await getUnmatchedRows(requestId);
  const toProcess = rows.slice(0, limit);

  let resolved = 0;
  let skippedMissingCas = 0;
  let createdMasters = 0;
  const errors: AutoResolveResult["errors"] = [];

  for (const row of toProcess) {
    if (!row.casNumber) {
      skippedMissingCas++;
      continue;
    }

    try {
      const cas = normalizeCas(row.casNumber);
      const ingType: IngredientType =
        (row.ingredientType as IngredientType) || "STANDARD";

      // 1. Try internal master by exact CAS
      const existing = await prisma.ingredientMaster.findFirst({
        where: { casNumber: cas },
        select: { id: true, inciName: true },
      });

      if (existing) {
        await resolveIngredient(userId, {
          requestId,
          uploadRowId: row.id,
          ingredientMasterId: existing.id,
          addSynonym: true,
          ingredientType: ingType,
          casNumber: cas,
        });
        resolved++;
        logger.info({
          event: "auto_resolve_matched",
          rowId: row.id,
          rawName: row.rawName,
          masterId: existing.id,
        });
        continue;
      }

      // 2. CAS Common Chemistry fallback
      const casResult = await lookupCasDetail(cas);

      if (
        casResult.commonChemistryStatus !== "FOUND" ||
        !casResult.commonChemistryName
      ) {
        errors.push({
          rowId: row.id,
          rawName: row.rawName,
          reason: `CAS lookup: ${casResult.commonChemistryReason ?? casResult.commonChemistryStatus}`,
        });
        // delay before next external lookup
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      const officialName = casResult.commonChemistryName;

      // 3. Create master + resolve
      try {
        await resolveIngredient(userId, {
          requestId,
          uploadRowId: row.id,
          createPayload: {
            inciName: officialName,
            casNumber: cas,
            synonyms:
              row.rawName.toLowerCase() !== officialName.toLowerCase()
                ? [row.rawName]
                : [],
          },
          addSynonym: true,
          ingredientType: ingType,
          casNumber: cas,
        });
        createdMasters++;
        resolved++;
        logger.info({
          event: "auto_resolve_created",
          rowId: row.id,
          rawName: row.rawName,
          officialName,
          cas,
        });
      } catch (createErr) {
        // Handle duplicate INCI name (another row may have created it)
        const msg = createErr instanceof Error ? createErr.message : "";
        if (msg.includes("Unique constraint")) {
          const byName = await prisma.ingredientMaster.findFirst({
            where: { inciName: officialName },
            select: { id: true },
          });
          if (byName) {
            await resolveIngredient(userId, {
              requestId,
              uploadRowId: row.id,
              ingredientMasterId: byName.id,
              addSynonym: true,
              ingredientType: ingType,
              casNumber: cas,
            });
            resolved++;
          } else {
            errors.push({
              rowId: row.id,
              rawName: row.rawName,
              reason: "Duplicate INCI name but master not found",
            });
          }
        } else {
          errors.push({
            rowId: row.id,
            rawName: row.rawName,
            reason: msg || "Create failed",
          });
        }
      }

      // rate-limit delay for CAS API
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      errors.push({
        rowId: row.id,
        rawName: row.rawName,
        reason: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  logger.info({
    event: "auto_resolve_complete",
    productId,
    requestId,
    total: toProcess.length,
    resolved,
    skippedMissingCas,
    createdMasters,
    errorCount: errors.length,
  });

  return { total: toProcess.length, resolved, skippedMissingCas, createdMasters, errors };
}
