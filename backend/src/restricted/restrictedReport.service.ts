import { prisma } from "../prisma.js";
import { logger } from "../logger.js";

// ── Types ──

export type RestrictedReportSummary = {
  productName: string;
  skuCode: string;
  brand: string | null;
  regions: string[];
  datasetName: string;
  datasetVersion: string;
  datasetEffectiveDate: string | null;
  checkedAt: string;
  totalIngredients: number;
  checkedByCas: number;
  missingCas: number;
  bannedCount: number;
  restrictedCount: number;
  listedCount: number;
  notFoundCount: number;
};

export type RestrictedReportRow = {
  ingredient: string;
  inciName: string | null;
  casNumber: string | null;
  restrictedStatus: string;
  reason: string;
  sourceLineRef: string;
  evidenceUrl: string;
};

export type RestrictedReportData = {
  summary: RestrictedReportSummary;
  hits: RestrictedReportRow[];
  allIngredients: RestrictedReportRow[];
};

// ── Data assembly ──

export async function buildRestrictedReportData(
  productId: string,
): Promise<RestrictedReportData> {
  // 1. Load product
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      skuCode: true,
      brand: true,
      targetRegions: true,
      latestUploadId: true,
    },
  });
  if (!product) throw new Error("PRODUCT_NOT_FOUND");
  if (!product.latestUploadId) throw new Error("NO_UPLOAD");

  // 2. Load active dataset
  const activeSource = await prisma.evidenceSource.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (!activeSource) throw new Error("NO_ACTIVE_DATASET");

  // 3. Load upload rows
  const uploadRows = await prisma.formulationUploadRow.findMany({
    where: { uploadId: product.latestUploadId },
    select: {
      id: true,
      rawName: true,
      casNumber: true,
      matchedIngredient: {
        select: { inciName: true, casNumber: true },
      },
    },
    orderBy: { rawName: "asc" },
  });

  // 4. Check each ingredient against the restricted index
  const hits: RestrictedReportRow[] = [];
  const allIngredients: RestrictedReportRow[] = [];
  let checkedByCas = 0;
  let missingCas = 0;
  let bannedCount = 0;
  let restrictedCount = 0;
  let listedCount = 0;
  let notFoundCount = 0;

  for (const row of uploadRows) {
    const effectiveCas = row.casNumber?.trim() || row.matchedIngredient?.casNumber?.trim() || null;
    const inciName = row.matchedIngredient?.inciName ?? null;

    if (!effectiveCas) {
      missingCas++;
      allIngredients.push({
        ingredient: row.rawName,
        inciName,
        casNumber: null,
        restrictedStatus: "CANNOT_CHECK",
        reason: "Missing CAS number",
        sourceLineRef: "",
        evidenceUrl: "",
      });
      continue;
    }

    checkedByCas++;
    const normalized = effectiveCas.replace(/[\s\u2010-\u2015]/g, "-").trim();

    const chemical = await prisma.restrictedChemicalIndex.findFirst({
      where: {
        sourceId: activeSource.id,
        casNo: normalized,
      },
    });

    if (chemical) {
      const statusStr = chemical.status;
      if (statusStr === "BANNED") bannedCount++;
      else if (statusStr === "RESTRICTED") restrictedCount++;
      else listedCount++;

      const reportRow: RestrictedReportRow = {
        ingredient: row.rawName,
        inciName,
        casNumber: effectiveCas,
        restrictedStatus: statusStr,
        reason: chemical.reason ?? "",
        sourceLineRef: chemical.sourceLineRef ?? "",
        evidenceUrl: chemical.evidenceUrl ?? "",
      };

      allIngredients.push(reportRow);

      if (statusStr === "BANNED" || statusStr === "RESTRICTED") {
        hits.push(reportRow);
      }
    } else {
      notFoundCount++;
      allIngredients.push({
        ingredient: row.rawName,
        inciName,
        casNumber: effectiveCas,
        restrictedStatus: "NOT_FOUND",
        reason: "Not found in restricted chemical index",
        sourceLineRef: "",
        evidenceUrl: "",
      });
    }
  }

  const summary: RestrictedReportSummary = {
    productName: product.name,
    skuCode: product.skuCode,
    brand: product.brand,
    regions: product.targetRegions ?? [],
    datasetName: activeSource.name,
    datasetVersion: activeSource.versionLabel,
    datasetEffectiveDate: activeSource.effectiveDate?.toISOString() ?? null,
    checkedAt: new Date().toISOString(),
    totalIngredients: uploadRows.length,
    checkedByCas,
    missingCas,
    bannedCount,
    restrictedCount,
    listedCount,
    notFoundCount,
  };

  logger.info({
    event: "restricted_report_data_built",
    productId,
    totalIngredients: summary.totalIngredients,
    hits: hits.length,
  });

  return { summary, hits, allIngredients };
}
