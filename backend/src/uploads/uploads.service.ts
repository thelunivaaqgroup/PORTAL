import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { parseFile } from "../extraction/file-parser.js";
import { extractWithAI } from "../extraction/ai-extractor.js";
import { env } from "../env.js";
import type {
  ExtractedRow,
  ExtractionMode,
  ParserSummary,
  AiSummary,
  ReasonCode,
} from "../extraction/extraction.types.js";
import { runComplianceForUpload } from "../compliance/compliance.service.js";
import { recomputeStageForFormulation } from "../products/productStage.service.js";
import { scheduleAlertsSweep } from "../alerts/alerts.scheduler.js";
import { runAicisScrutinyForUpload } from "../aicis/aicis.service.js";

export interface UploadResult {
  upload: Awaited<ReturnType<typeof prisma.formulationUpload.findUniqueOrThrow>>;
  rowCount: number;
  reasonCode: ReasonCode;
  extractionMode: ExtractionMode;
  parserSummary: ParserSummary;
  aiSummary: AiSummary;
}

/**
 * Upload a file using STRUCTURED-FIRST, AI-FALLBACK architecture.
 * 1) Run structured parser. If rows found → save, skip AI.
 * 2) If no structured rows → run AI extractor as fallback.
 * Always stores the upload record, even on failure.
 */
export async function createUploadWithExtraction(opts: {
  formulationId: string;
  productId?: string;
  userId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
}): Promise<UploadResult> {
  const storageKey = opts.storagePath;

  // ── 1. Parse file (structured extraction) ──
  let parserSummary: ParserSummary = {
    fileType: opts.mimeType,
    extractedRowCountBeforeAI: 0,
  };

  let rawText = "";
  let parseError: string | null = null;
  let structuredRows: { name: string; pct: number | null; cas?: string }[] = [];

  try {
    const parsed = await parseFile(opts.storagePath, opts.mimeType);
    rawText = parsed.rawText;
    structuredRows = parsed.structuredRows ?? [];

    if (parsed.parserMeta) {
      parserSummary = { ...parsed.parserMeta };
    } else {
      parserSummary = {
        fileType: parsed.format,
        extractedRowCountBeforeAI: parsed.rowCount ?? 0,
      };
    }
  } catch (err) {
    parseError = err instanceof Error ? err.message : "Parse failed";
  }

  // ── 2. STRUCTURED-FIRST: use parser rows if available, skip AI ──
  let rows: ExtractedRow[] = [];
  let extractionMode: ExtractionMode = "NONE";
  let reasonCode: ReasonCode;
  let aiError: string | null = null;

  const aiSummary: AiSummary = {
    enabled: false,
    inputChars: 0,
    outputRows: 0,
  };

  if (structuredRows.length > 0) {
    // Structured parser succeeded — use directly, no AI call
    rows = structuredRows.map((sr) => ({
      rawName: sr.name,
      suggestedInciName: sr.name,
      casNumber: sr.cas,
      concentrationPct: sr.pct ?? undefined,
      confidence: 0.9,
      issues: sr.pct === null ? ["Missing concentration percentage"] : [],
    }));
    extractionMode = "STRUCTURED";
    reasonCode = "STRUCTURED_OK";
  } else {
    // ── 3. AI-FALLBACK: no structured rows, try AI ──
    const aiEnabled = Boolean(env.ANTHROPIC_API_KEY);
    aiSummary.enabled = aiEnabled;
    aiSummary.inputChars = rawText.length;

    if (!parseError && rawText.length > 0 && aiEnabled) {
      try {
        const parsed = {
          format: detectFormat(opts.mimeType, opts.storagePath),
          rawText,
        };
        rows = await extractWithAI(parsed);
      } catch (err) {
        aiError = err instanceof Error ? err.message : "AI extraction failed";
      }
    }

    aiSummary.outputRows = rows.length;

    if (rows.length > 0) {
      extractionMode = "AI";
      reasonCode = "AI_FALLBACK_USED";
    } else {
      extractionMode = "NONE";
      // Determine specific failure reason
      if (parseError) {
        reasonCode = parseError.includes("Unsupported") ? "UNSUPPORTED_FILE" : "PARSER_EMPTY";
      } else if (rawText.length === 0) {
        const isXlsx = parserSummary.fileType === "xlsx";
        const xlsxNoTable = isXlsx && parserSummary.headerRowIndex === null;
        reasonCode = xlsxNoTable ? "XLSX_NO_TABLE" : "PARSER_EMPTY";
      } else if (!aiEnabled) {
        reasonCode = "AI_DISABLED";
      } else {
        reasonCode = "EXTRACTION_FAILED";
      }
    }
  }

  // ── 4. Log summary ──
  logger.info({
    event: "formulation_upload_extraction",
    formulationId: opts.formulationId,
    fileName: opts.fileName,
    extractionMode,
    reasonCode,
    parserSummary,
    aiSummary,
    parseError,
    aiError,
  });

  // ── 5. Persist ──
  const rawExtractJson = {
    reasonCode,
    extractionMode,
    parserSummary,
    aiSummary,
    rows,
    parseError,
    aiError,
  };

  // Core transaction: FormulationUpload + rows + matching (no optional columns)
  const upload = await prisma.$transaction(async (tx) => {
    const created = await tx.formulationUpload.create({
      data: {
        formulationId: opts.formulationId,
        fileName: opts.fileName,
        mimeType: opts.mimeType,
        sizeBytes: opts.sizeBytes,
        storageKey,
        createdByUserId: opts.userId,
        rawExtractJson: rawExtractJson as object,
      },
    });

    if (rows.length > 0) {
      await tx.formulationUploadRow.createMany({
        data: rows.map((row) => ({
          uploadId: created.id,
          rawName: row.rawName,
          detectedPct: row.concentrationPct ?? null,
          inciSuggestion: row.suggestedInciName ?? null,
          casNumber: row.casNumber ?? null,
          confidence: row.confidence,
          issues: row.issues,
        })),
      });
    }

    // ── 5b. Run ingredient matching on persisted rows ──
    if (rows.length > 0) {
      await matchUploadRows(tx, created.id);
    }

    // Link upload to product inside the same transaction
    if (opts.productId) {
      await tx.formulationUpload.update({
        where: { id: created.id },
        data: { productId: opts.productId },
      });
      await tx.product.update({
        where: { id: opts.productId },
        data: { latestUploadId: created.id },
      });
    }

    return tx.formulationUpload.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        rows: {
          orderBy: { createdAt: "asc" },
          include: { matchedIngredient: { select: { id: true, inciName: true } } },
        },
      },
    });
  });

  // ── 6. Structured log line ──
  console.log(JSON.stringify({
    uploadId: upload.id,
    extractionMode,
    rowCount: rows.length,
  }));

  // ── 7. Run compliance checks (non-blocking — errors logged, not thrown) ──
  if (rows.length > 0) {
    try {
      await runComplianceForUpload(upload.id, ["AU"]);
    } catch (err) {
      logger.error({ err, uploadId: upload.id }, "compliance check failed (non-fatal)");
    }
  }

  // ── 8. Run AICIS scrutiny (non-blocking — errors logged, not thrown) ──
  if (rows.length > 0) {
    try {
      await runAicisScrutinyForUpload(upload.id, "AU", opts.userId);
    } catch (err) {
      logger.error({ err, uploadId: upload.id }, "AICIS scrutiny failed (non-fatal)");
    }
  }

  // ── 10. Recompute product stage for any product with this formulation active ──
  try {
    await recomputeStageForFormulation(opts.formulationId, opts.userId);
  } catch (err) {
    logger.error({ err, formulationId: opts.formulationId }, "stage recompute failed (non-fatal)");
  }

  // ── 11. Schedule alerts sweep (non-blocking) ──
  try { scheduleAlertsSweep("formulation_upload"); } catch (_) { /* non-fatal */ }

  return {
    upload,
    rowCount: rows.length,
    reasonCode,
    extractionMode,
    parserSummary,
    aiSummary,
  };
}

// ── Helper: detect format from mime/path ──

// ── Ingredient Matching Engine ──
// Priority: EXACT (inciName) → CAS → SYNONYM → NONE

type MatchResult = {
  matchedIngredientId: string;
  matchType: "EXACT" | "CAS" | "SYNONYM";
  matchConfidence: number;
} | null;

async function matchRowToIngredient(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  rawName: string,
  casNumber: string | null,
): Promise<MatchResult> {
  const normalised = rawName.trim().toLowerCase();

  // 1. EXACT match on inciName (case-insensitive)
  const exactMatch = await tx.ingredientMaster.findFirst({
    where: { inciName: { equals: normalised, mode: "insensitive" } },
    select: { id: true },
  });
  if (exactMatch) {
    return { matchedIngredientId: exactMatch.id, matchType: "EXACT", matchConfidence: 1.0 };
  }

  // 2. CAS match (if casNumber is present)
  if (casNumber) {
    const casMatch = await tx.ingredientMaster.findFirst({
      where: { casNumber: casNumber.trim() },
      select: { id: true },
    });
    if (casMatch) {
      return { matchedIngredientId: casMatch.id, matchType: "CAS", matchConfidence: 0.95 };
    }
  }

  // 3. SYNONYM match (case-insensitive)
  const synonymMatch = await tx.ingredientSynonym.findFirst({
    where: { name: { equals: normalised, mode: "insensitive" } },
    select: { ingredientId: true },
  });
  if (synonymMatch) {
    return { matchedIngredientId: synonymMatch.ingredientId, matchType: "SYNONYM", matchConfidence: 0.85 };
  }

  return null;
}

async function matchUploadRows(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  uploadId: string,
) {
  const rows = await tx.formulationUploadRow.findMany({
    where: { uploadId },
    select: { id: true, rawName: true, casNumber: true },
  });

  for (const row of rows) {
    const match = await matchRowToIngredient(tx, row.rawName, row.casNumber);
    if (match) {
      await tx.formulationUploadRow.update({
        where: { id: row.id },
        data: {
          matchedIngredientId: match.matchedIngredientId,
          matchType: match.matchType,
          matchConfidence: match.matchConfidence,
        },
      });
    }
  }
}

/**
 * Manually override the matched ingredient for a single upload row.
 */
export async function manualMatchRow(rowId: string, ingredientId: string) {
  // Verify ingredient exists
  const ingredient = await prisma.ingredientMaster.findUnique({
    where: { id: ingredientId },
    select: { id: true, inciName: true },
  });
  if (!ingredient) {
    throw new Error("Ingredient not found");
  }

  const updated = await prisma.formulationUploadRow.update({
    where: { id: rowId },
    data: {
      matchedIngredientId: ingredientId,
      matchType: "MANUAL",
      matchConfidence: 1.0,
    },
    include: { matchedIngredient: { select: { id: true, inciName: true } } },
  });

  return updated;
}

// ── Helper: detect format from mime/path ──

function detectFormat(mimeType: string, filePath: string): "csv" | "xlsx" | "pdf" | "image" {
  if (mimeType === "text/csv" || filePath.endsWith(".csv")) return "csv";
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    filePath.endsWith(".xlsx") ||
    filePath.endsWith(".xls")
  ) return "xlsx";
  if (mimeType === "application/pdf" || filePath.endsWith(".pdf")) return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  return "csv"; // fallback
}

/**
 * Get the latest upload for a formulation.
 */
export async function getLatestUpload(formulationId: string) {
  return prisma.formulationUpload.findFirst({
    where: { formulationId },
    orderBy: { createdAt: "desc" },
    include: {
      rows: {
        orderBy: { createdAt: "asc" },
        include: { matchedIngredient: { select: { id: true, inciName: true } } },
      },
    },
  });
}

/**
 * Get the latest upload for a product (via productId).
 */
export async function getLatestUploadByProduct(productId: string) {
  return prisma.formulationUpload.findFirst({
    where: { productId },
    orderBy: { createdAt: "desc" },
    include: {
      rows: {
        orderBy: { createdAt: "asc" },
        include: { matchedIngredient: { select: { id: true, inciName: true } } },
      },
      complianceSnapshots: true,
    },
  });
}

/**
 * List all uploads for a formulation (newest first).
 */
export async function listUploads(formulationId: string) {
  return prisma.formulationUpload.findMany({
    where: { formulationId },
    orderBy: { createdAt: "desc" },
    include: {
      rows: {
        orderBy: { createdAt: "asc" },
        include: { matchedIngredient: { select: { id: true, inciName: true } } },
      },
      createdBy: { select: { id: true, fullName: true, email: true } },
    },
  });
}

/**
 * List all uploads for a product (newest first).
 */
export async function listUploadsByProduct(productId: string) {
  return prisma.formulationUpload.findMany({
    where: { productId },
    orderBy: { createdAt: "desc" },
    include: {
      rows: {
        orderBy: { createdAt: "asc" },
        include: { matchedIngredient: { select: { id: true, inciName: true } } },
      },
      createdBy: { select: { id: true, fullName: true, email: true } },
    },
  });
}

/**
 * Get a single upload by id (ensures it belongs to the formulation).
 */
export async function getUploadById(formulationId: string, uploadId: string) {
  return prisma.formulationUpload.findFirst({
    where: { id: uploadId, formulationId },
    include: {
      rows: {
        orderBy: { createdAt: "asc" },
        include: { matchedIngredient: { select: { id: true, inciName: true } } },
      },
      createdBy: { select: { id: true, fullName: true, email: true } },
    },
  });
}

/**
 * Get a single upload by id scoped to a product.
 */
export async function getUploadByIdForProduct(productId: string, uploadId: string) {
  return prisma.formulationUpload.findFirst({
    where: { id: uploadId, productId },
    include: {
      rows: {
        orderBy: { createdAt: "asc" },
        include: { matchedIngredient: { select: { id: true, inciName: true } } },
      },
      createdBy: { select: { id: true, fullName: true, email: true } },
    },
  });
}

// ── Replace Formulation ──

export type ReplaceFormulationResult = {
  newUpload: UploadResult;
  archivedUploadId: string | null;
  previousVersion: number;
  newVersion: number;
};

/**
 * Replace the active formulation upload for a product.
 * 1. Archive the current ACTIVE upload (set status=ARCHIVED, archivedAt, archivedByUserId).
 * 2. Create a new upload as ACTIVE with version = maxVersion + 1.
 * 3. Reset compliance state for the product.
 *
 * Atomically ensures only one ACTIVE upload per product.
 */
export async function replaceFormulation(opts: {
  productId: string;
  formulationId: string;
  userId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
}): Promise<ReplaceFormulationResult> {
  const now = new Date();

  // Step 1: Archive current ACTIVE upload + compute next version (in a transaction)
  const { archivedUploadId, previousVersion, nextVersion } = await prisma.$transaction(async (tx) => {
    // Find current ACTIVE upload for this product
    const currentActive = await tx.formulationUpload.findFirst({
      where: { productId: opts.productId, status: "ACTIVE" },
      select: { id: true, version: true },
    });

    // Get max version across ALL uploads for this product (active + archived)
    const maxVersionResult = await tx.formulationUpload.aggregate({
      where: { productId: opts.productId },
      _max: { version: true },
    });
    const maxVersion = maxVersionResult._max.version ?? 0;
    const prevVersion = currentActive?.version ?? 0;

    // Archive the current active upload if it exists
    if (currentActive) {
      await tx.formulationUpload.update({
        where: { id: currentActive.id },
        data: {
          status: "ARCHIVED",
          archivedAt: now,
          archivedByUserId: opts.userId,
        },
      });
    }

    // Guard: ensure no other ACTIVE uploads remain (belt-and-suspenders)
    await tx.formulationUpload.updateMany({
      where: {
        productId: opts.productId,
        status: "ACTIVE",
        id: currentActive ? { not: currentActive.id } : undefined,
      },
      data: {
        status: "ARCHIVED",
        archivedAt: now,
        archivedByUserId: opts.userId,
      },
    });

    return {
      archivedUploadId: currentActive?.id ?? null,
      previousVersion: prevVersion,
      nextVersion: maxVersion + 1,
    };
  });

  // Step 2: Create new upload via the existing extraction pipeline
  const newUpload = await createUploadWithExtraction({
    formulationId: opts.formulationId,
    productId: opts.productId,
    userId: opts.userId,
    fileName: opts.fileName,
    mimeType: opts.mimeType,
    sizeBytes: opts.sizeBytes,
    storagePath: opts.storagePath,
  });

  // Step 3: Set version and status on the new upload
  await prisma.formulationUpload.update({
    where: { id: newUpload.upload.id },
    data: {
      status: "ACTIVE",
      version: nextVersion,
    },
  });

  // Step 4: Update product.latestUploadId to point to new upload
  await prisma.product.update({
    where: { id: opts.productId },
    data: { latestUploadId: newUpload.upload.id },
  });

  // Step 5: Reset compliance state — mark existing compliance requests as stale
  // We reset by updating the latest compliance request to DRAFT with cleared eligibility
  const latestComplianceRequest = await prisma.complianceRequest.findFirst({
    where: { productId: opts.productId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (latestComplianceRequest) {
    await prisma.complianceRequest.update({
      where: { id: latestComplianceRequest.id },
      data: {
        uploadId: newUpload.upload.id,
        status: "DRAFT",
        eligibilityStatus: null,
        ingredientMatchingStatus: null,
        aicisScrutinyStatus: null,
        bannedRestrictedStatus: null,
        issuesJson: Prisma.DbNull,
        evidenceRequiredJson: Prisma.DbNull,
        checkedAt: null,
        checkedByUserId: null,
        eligibilityReportJson: Prisma.DbNull,
        eligibleAt: null,
        approvedByUserId: null,
        approvedAt: null,
      },
    });
  }

  logger.info({
    event: "formulation_replaced",
    productId: opts.productId,
    archivedUploadId,
    newUploadId: newUpload.upload.id,
    previousVersion,
    newVersion: nextVersion,
  });

  return {
    newUpload,
    archivedUploadId,
    previousVersion,
    newVersion: nextVersion,
  };
}

/**
 * Get the active formulation upload for a product.
 */
export async function getActiveUploadForProduct(productId: string) {
  return prisma.formulationUpload.findFirst({
    where: { productId, status: "ACTIVE" },
    include: {
      rows: {
        orderBy: { createdAt: "asc" },
        include: { matchedIngredient: { select: { id: true, inciName: true } } },
      },
      createdBy: { select: { id: true, fullName: true, email: true } },
    },
  });
}

/**
 * Get archived formulation uploads for a product (newest first).
 */
export async function getArchivedUploadsForProduct(productId: string) {
  return prisma.formulationUpload.findMany({
    where: { productId, status: "ARCHIVED" },
    orderBy: { archivedAt: "desc" },
    select: {
      id: true,
      fileName: true,
      version: true,
      createdAt: true,
      archivedAt: true,
      archivedBy: { select: { id: true, fullName: true } },
      createdBy: { select: { id: true, fullName: true } },
      _count: { select: { rows: true } },
    },
  });
}
