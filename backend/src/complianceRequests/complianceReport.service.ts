import { prisma } from "../prisma.js";
import { logger } from "../logger.js";

// ── Report data types ──

export type ReportSummary = {
  productName: string;
  skuCode: string;
  brand: string | null;
  regions: string[];
  checkedAt: string | null;
  eligibilityStatus: string | null;
  ingredientMatchingStatus: string | null;
  aicisScrutinyStatus: string | null;
  bannedRestrictedStatus: string | null;
  totalIngredients: number;
  matchedIngredients: number;
  missingCasCount: number;
  aicisNotFoundCount: number;
  bannedRestrictedHits: number;
  poisonousScheduledHits: number;
  needsReviewCount: number;
  evidenceRequiredCount: number;
};

export type ExceptionRow = {
  ingredient: string;
  inciName: string | null;
  casNumber: string | null;
  issueCategory: string;
  aicisResult: string;
  evidenceRequired: string;
  reason: string;
  source: string;
  evidenceLink: string;
};

export type IngredientRow = {
  ingredient: string;
  inciName: string | null;
  casNumber: string | null;
  concentration: string;
  matchStatus: string;
  matchType: string;
  aicisResult: string;
  issues: string;
};

export type ComplianceReportData = {
  summary: ReportSummary;
  exceptions: ExceptionRow[];
  allIngredients: IngredientRow[];
};

// ── Main data assembly function ──

export async function buildComplianceReportData(
  productId: string,
): Promise<ComplianceReportData> {
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

  // 2. Load latest compliance request
  const request = await prisma.complianceRequest.findFirst({
    where: { productId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      uploadId: true,
      regionScope: true,
      eligibilityStatus: true,
      ingredientMatchingStatus: true,
      aicisScrutinyStatus: true,
      bannedRestrictedStatus: true,
      checkedAt: true,
      issuesJson: true,
      evidenceRequiredJson: true,
      aicisSnapshotId: true,
      bannedRestrictedSnapshotId: true,
    },
  });
  if (!request || !request.checkedAt) throw new Error("NO_COMPLIANCE_RUN");

  // 3. Load all upload rows with matched ingredient + AICIS findings
  const uploadRows = await prisma.formulationUploadRow.findMany({
    where: { uploadId: request.uploadId },
    select: {
      id: true,
      rawName: true,
      casNumber: true,
      detectedPct: true,
      matchedIngredientId: true,
      matchType: true,
      matchConfidence: true,
      matchedIngredient: {
        select: { inciName: true, casNumber: true },
      },
      aicisFindings: {
        where: request.aicisSnapshotId
          ? { scrutinySnapshot: { snapshotId: request.aicisSnapshotId, isActive: true } }
          : { id: "__never__" },
        select: {
          result: true,
          matchMethod: true,
          matchedCrNo: true,
          matchedApprovedName: true,
          commonChemistryStatus: true,
          commonChemistryName: true,
        },
        take: 1,
      },
    },
    orderBy: { rawName: "asc" },
  });

  // 4. Load banned/restricted hits for these rows
  const brHits = new Map<string, { chemicalName: string | null; cas: string }>();
  const poisonHits = new Set<string>();

  if (request.bannedRestrictedSnapshotId) {
    const latestBr = await prisma.bannedRestrictedSnapshot.findFirst({
      where: { isComplete: true },
      orderBy: { fetchedAt: "desc" },
      select: { id: true },
    });
    const brSnapId = latestBr?.id ?? request.bannedRestrictedSnapshotId;

    for (const row of uploadRows) {
      const cas = row.casNumber?.trim() || row.matchedIngredient?.casNumber?.trim();
      if (!cas) continue;
      const normalized = cas.replace(/[\s\u2010-\u2015]/g, "-").trim();
      const match = await prisma.bannedRestrictedChemical.findFirst({
        where: { snapshotId: brSnapId, normalizedCasNo: normalized },
        select: { chemicalName: true, normalizedCasNo: true, source: { select: { linkType: true } } },
      });
      if (match) {
        brHits.set(row.id, { chemicalName: match.chemicalName, cas: match.normalizedCasNo });
        if (match.source?.linkType === "POISONS_STANDARD") {
          poisonHits.add(row.id);
        }
      }
    }

    // Also check Poisons Standard name-only matches
    const poisonsNameEntries = await prisma.bannedRestrictedChemical.findMany({
      where: {
        snapshotId: brSnapId,
        normalizedCasNo: { startsWith: "NAME_ONLY:" },
        source: { linkType: "POISONS_STANDARD" },
      },
      select: { chemicalName: true },
    });
    if (poisonsNameEntries.length > 0) {
      const poisonsNames = poisonsNameEntries
        .map((e) => e.chemicalName?.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim())
        .filter(Boolean) as string[];
      for (const row of uploadRows) {
        const ingredientName = row.rawName.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
        if (ingredientName.length < 3) continue;
        const nameFound = poisonsNames.some(
          (pn) => pn === ingredientName || pn.includes(ingredientName) || ingredientName.includes(pn),
        );
        if (nameFound) poisonHits.add(row.id);
      }
    }
  }

  // 5. Parse issues and evidence from compliance request
  const issues = (request.issuesJson ?? []) as { severity: string; ingredientName: string | null; message: string }[];
  const evidenceRequired = (request.evidenceRequiredJson ?? []) as {
    ingredientName: string;
    requiredDocuments: string[];
    reason: string;
  }[];

  // Build evidence lookup by ingredient name
  const evidenceByIngredient = new Map<string, string[]>();
  for (const ev of evidenceRequired) {
    evidenceByIngredient.set(ev.ingredientName.toLowerCase(), ev.requiredDocuments);
  }

  // Build issues lookup by ingredient name
  const issuesByIngredient = new Map<string, { severity: string; message: string }[]>();
  for (const issue of issues) {
    const key = (issue.ingredientName ?? "").toLowerCase();
    const list = issuesByIngredient.get(key) ?? [];
    list.push({ severity: issue.severity, message: issue.message });
    issuesByIngredient.set(key, list);
  }

  // 6. Assemble data
  let missingCasCount = 0;
  let aicisNotFoundCount = 0;
  let needsReviewCount = 0;
  let poisonousCount = 0;
  const exceptions: ExceptionRow[] = [];
  const allIngredients: IngredientRow[] = [];

  for (const row of uploadRows) {
    const aicis = row.aicisFindings[0];
    const aicisResult = aicis?.result ?? "SKIPPED";
    const effectiveCas = row.casNumber || row.matchedIngredient?.casNumber || null;
    const isMatched = !!row.matchedIngredientId;
    const inciName = row.matchedIngredient?.inciName ?? null;
    const rowIssues = issuesByIngredient.get(row.rawName.toLowerCase()) ?? [];
    const rowEvidence = evidenceByIngredient.get(row.rawName.toLowerCase()) ?? [];
    const isBrHit = brHits.has(row.id);
    const isPoisonHit = poisonHits.has(row.id);
    const hasMissingCas = !effectiveCas || effectiveCas.trim() === "";

    // Build all-ingredients entry
    allIngredients.push({
      ingredient: row.rawName,
      inciName,
      casNumber: effectiveCas,
      concentration: row.detectedPct != null ? `${row.detectedPct}%` : "",
      matchStatus: isMatched ? "MATCHED" : "UNMATCHED",
      matchType: row.matchType ?? "",
      aicisResult,
      issues: rowIssues.map((i) => `[${i.severity}] ${i.message}`).join("; "),
    });

    // Determine if this row is an exception
    const issueCategories: string[] = [];
    const reasons: string[] = [];
    const sources: string[] = [];

    if (isBrHit) {
      if (isPoisonHit) {
        issueCategories.push("Poisonous/Scheduled");
        poisonousCount++;
      } else {
        issueCategories.push("Banned/Restricted");
      }
      reasons.push(`Found in banned/restricted sources (CAS: ${brHits.get(row.id)!.cas})`);
      sources.push("Internal");
    }

    if (hasMissingCas) {
      issueCategories.push("Missing CAS");
      missingCasCount++;
      reasons.push("Missing CAS — cannot verify against banned/restricted sources");
      sources.push("Internal");
    }

    if (aicisResult === "NOT_FOUND") {
      issueCategories.push("Not in AICIS");
      aicisNotFoundCount++;
      reasons.push("Not found in AICIS Inventory");
      sources.push("AICIS");
    } else if (aicisResult === "NEEDS_REVIEW") {
      issueCategories.push("Needs Review");
      needsReviewCount++;
      reasons.push("CAS validation API unavailable — could not verify");
      sources.push("CAS Common Chemistry");
    } else if (aicisResult === "AMBIGUOUS") {
      issueCategories.push("Ambiguous");
      needsReviewCount++;
      reasons.push("Ambiguous match — multiple AICIS entries matched by name");
      sources.push("AICIS");
    } else if (aicisResult === "MISSING_CAS") {
      if (!issueCategories.includes("Missing CAS")) {
        issueCategories.push("Missing CAS");
        if (!hasMissingCas) missingCasCount++;
      }
      reasons.push("Missing CAS — could not verify AICIS listing");
      sources.push("AICIS");
    }

    if (!isMatched && issueCategories.length === 0) {
      issueCategories.push("Unresolved");
      reasons.push("Unmatched ingredient — not resolved to ingredient master");
      sources.push("Internal");
    }

    if (issueCategories.length > 0) {
      exceptions.push({
        ingredient: row.rawName,
        inciName,
        casNumber: effectiveCas,
        issueCategory: issueCategories.join("; "),
        aicisResult,
        evidenceRequired: rowEvidence.join(", "),
        reason: reasons.join("; "),
        source: [...new Set(sources)].join(", "),
        evidenceLink: "",
      });
    }
  }

  const summary: ReportSummary = {
    productName: product.name,
    skuCode: product.skuCode,
    brand: product.brand,
    regions: request.regionScope ?? product.targetRegions ?? [],
    checkedAt: request.checkedAt?.toISOString() ?? null,
    eligibilityStatus: request.eligibilityStatus,
    ingredientMatchingStatus: request.ingredientMatchingStatus,
    aicisScrutinyStatus: request.aicisScrutinyStatus,
    bannedRestrictedStatus: request.bannedRestrictedStatus,
    totalIngredients: uploadRows.length,
    matchedIngredients: uploadRows.filter((r) => !!r.matchedIngredientId).length,
    missingCasCount,
    aicisNotFoundCount,
    bannedRestrictedHits: brHits.size,
    poisonousScheduledHits: poisonousCount,
    needsReviewCount,
    evidenceRequiredCount: evidenceRequired.length,
  };

  logger.info({
    event: "compliance_report_data_built",
    productId,
    totalIngredients: summary.totalIngredients,
    exceptions: exceptions.length,
  });

  return { summary, exceptions, allIngredients };
}
