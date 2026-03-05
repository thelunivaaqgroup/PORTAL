import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { writeAuditLog } from "../audit/audit.service.js";
import type { CheckStatus, EligibilityStatus } from "@prisma/client";

// ── Types ──

export type CheckResult = {
  key: string;
  label: string;
  status: CheckStatus;
  reason: string;
  evidenceLinks: string[];
  issues: Issue[];
  evidenceRequired: EvidenceRequirement[];
};

export type Issue = {
  severity: "ERROR" | "WARNING" | "INFO";
  ingredientName: string | null;
  message: string;
};

export type EvidenceRequirement = {
  ingredientName: string;
  requiredDocuments: string[];
  reason: string;
};

export type EligibilityReport3 = {
  eligibilityStatus: EligibilityStatus;
  ingredientMatchingStatus: CheckStatus;
  aicisScrutinyStatus: CheckStatus;
  bannedRestrictedStatus: CheckStatus;
  checks: CheckResult[];
  issues: Issue[];
  evidenceRequired: EvidenceRequirement[];
  checkedAt: string;
};

// ── Botanical / Blend / Polymer detection ──

const BOTANICAL_PATTERNS = [
  /\bextract\b/i,
  /\bextractum\b/i,
  /\b(?:flower|leaf|root|bark|seed|fruit|herb|plant)\s+(?:extract|oil|water|powder)\b/i,
  /\bhydrosol\b/i,
  /\bessential\s+oil\b/i,
  /\bbotanical\b/i,
  /\bphyto/i,
  /\bferment\b/i,
  /\bfiltrate\b/i,
  /\blysate\b/i,
  /\bcallus\s+(?:culture|extract)\b/i,
  /\bhydrolyzed\b/i,
  /\bsaponified\b/i,
];

const BLEND_PATTERNS = [
  /\bblend\b/i,
  /\bcomplex\b/i,
  /\bproprietary\b/i,
  /\bfragrance\b/i,
  /\bperfume\b/i,
  /\bparfum\b/i,
  /\baroma\b/i,
  /\bflavor\b/i,
  /\bcomposition\b/i,
  /\bbase\s+(?:mix|blend)\b/i,
];

const POLYMER_PATTERNS = [
  /\bpolymer\b/i,
  /\bcopolymer\b/i,
  /\bcrosspolymer\b/i,
  /\bpolysorbate\b/i,
  /\bpolyethylene\b/i,
  /\bpolypropylene\b/i,
  /\bpolydimethylsiloxane\b/i,
  /\bsilicone\b/i,
  /\bdimethicone\b/i,
  /\bcyclomethicone\b/i,
  /\bcarbomer\b/i,
  /\bacrylat/i,
  /\bpeg-\d/i,
  /\bppg-\d/i,
];

type IngredientCategory = "BOTANICAL" | "BLEND" | "POLYMER" | "STANDARD";

function categorizeIngredient(name: string): IngredientCategory {
  if (BOTANICAL_PATTERNS.some((p) => p.test(name))) return "BOTANICAL";
  if (BLEND_PATTERNS.some((p) => p.test(name))) return "BLEND";
  if (POLYMER_PATTERNS.some((p) => p.test(name))) return "POLYMER";
  return "STANDARD";
}

function evidenceDocsForCategory(category: IngredientCategory): string[] {
  switch (category) {
    case "BOTANICAL":
      return ["SDS (Safety Data Sheet)", "COA (Certificate of Analysis)", "Botanical specification sheet"];
    case "BLEND":
      return ["Full composition statement", "Supplier declaration with CAS breakdown", "SDS (Safety Data Sheet)"];
    case "POLYMER":
      return ["SDS (Safety Data Sheet)", "Polymer composition certificate", "Supplier declaration"];
    case "STANDARD":
      return ["SDS (Safety Data Sheet)", "COA (Certificate of Analysis)"];
  }
}

// ── Ingredient name normalization ──

/** Tokens that can be stripped for fuzzy ingredient matching */
const REMOVABLE_TOKENS = new Set([
  "extract", "powder", "oil", "organic", "natural", "pure",
  "certified", "cold-pressed", "cold", "pressed", "virgin", "extra",
  "refined", "unrefined", "deodorized", "hydrogenated",
  "purified", "plant", "based", "gel",
]);

function normalizeIngredientName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIngredientNameStripped(raw: string): string {
  const words = normalizeIngredientName(raw).split(" ");
  const filtered = words.filter((w) => !REMOVABLE_TOKENS.has(w));
  return filtered.join(" ").trim();
}

// ── Check: Ingredient Matching ──

async function checkIngredientMatching(
  uploadId: string,
): Promise<CheckResult> {
  const upload = await prisma.formulationUpload.findUnique({
    where: { id: uploadId },
    include: {
      rows: {
        select: {
          id: true,
          rawName: true,
          casNumber: true,
          matchedIngredientId: true,
          matchType: true,
        },
      },
    },
  });

  if (!upload || upload.rows.length === 0) {
    return {
      key: "ingredient_matching",
      label: "Ingredient Matching (Informational)",
      status: "FAIL",
      reason: "No formulation upload or no extracted ingredients found.",
      evidenceLinks: [],
      issues: [{ severity: "ERROR", ingredientName: null, message: "No ingredients in upload." }],
      evidenceRequired: [],
    };
  }

  const unmatched = upload.rows.filter((r) => !r.matchedIngredientId);
  const issues: Issue[] = [];
  const evidenceRequired: EvidenceRequirement[] = [];

  if (unmatched.length === 0) {
    return {
      key: "ingredient_matching",
      label: "Ingredient Matching (Informational)",
      status: "PASS",
      reason: `All ${upload.rows.length} ingredients are matched to the ingredient master.`,
      evidenceLinks: [],
      issues: [],
      evidenceRequired: [],
    };
  }

  // For each unmatched row, attempt normalization + synonym + CAS + trade-name resolution
  let hasStandardUnmatched = false;
  let synonymResolved = 0;

  for (const row of unmatched) {
    // Use stored ingredientType if previously resolved, otherwise infer from name
    const category = categorizeIngredient(row.rawName);

    // Try CAS-based match first (if CAS number is available)
    if (row.casNumber?.trim()) {
      const casFound = await attemptCasMatch(row.casNumber);
      if (casFound) {
        synonymResolved++;
        issues.push({
          severity: "INFO",
          ingredientName: row.rawName,
          message: `Resolved via CAS match (${row.casNumber}) → "${casFound}". Consider linking in ingredient master.`,
        });
        continue;
      }
    }

    // Attempt synonym/trade-name/normalized match for standard ingredients
    if (category === "STANDARD") {
      const found = await attemptSynonymMatch(row.rawName);
      if (found) {
        synonymResolved++;
        issues.push({
          severity: "INFO",
          ingredientName: row.rawName,
          message: `Resolved via synonym/normalization → "${found}". Consider linking in ingredient master.`,
        });
        continue;
      }

      hasStandardUnmatched = true;
      issues.push({
        severity: "ERROR",
        ingredientName: row.rawName,
        message: `Unmatched standard ingredient — no synonym found. Must be resolved before approval.`,
      });
    } else {
      issues.push({
        severity: "WARNING",
        ingredientName: row.rawName,
        message: `Unmatched ${category.toLowerCase()} ingredient — requires supporting evidence.`,
      });
      evidenceRequired.push({
        ingredientName: row.rawName,
        requiredDocuments: evidenceDocsForCategory(category),
        reason: `${category.toLowerCase()} ingredient not matched to master — evidence needed to confirm identity and safety.`,
      });
    }
  }

  const directMatched = upload.rows.length - unmatched.length;
  const totalEffective = directMatched + synonymResolved;

  // If any standard ingredient is unmatched (even after synonym) → FAIL
  // If only botanical/blend/polymer → NEEDS_REVIEW
  const status: CheckStatus = hasStandardUnmatched ? "FAIL" : "NEEDS_REVIEW";

  const reasonSynonym = synonymResolved > 0 ? ` (${synonymResolved} resolved via synonyms)` : "";

  return {
    key: "ingredient_matching",
    label: "Ingredient Matching (Informational)",
    status,
    reason: status === "FAIL"
      ? `${totalEffective}/${upload.rows.length} matched${reasonSynonym}. Remaining unmatched standard ingredient(s) must be resolved.`
      : `${totalEffective}/${upload.rows.length} matched${reasonSynonym}. Remaining botanical/blend/polymer ingredient(s) require evidence.`,
    evidenceLinks: [],
    issues,
    evidenceRequired,
  };
}

/** Try to resolve an ingredient via synonym table, trade-name aliases, or normalized name matching */
async function attemptSynonymMatch(rawName: string): Promise<string | null> {
  const normalized = normalizeIngredientName(rawName);
  const stripped = normalizeIngredientNameStripped(rawName);

  // 1. Try exact synonym match (case-insensitive)
  const synonym = await prisma.ingredientSynonym.findFirst({
    where: { name: { equals: rawName, mode: "insensitive" } },
    include: { ingredient: { select: { inciName: true } } },
  });
  if (synonym?.ingredient) return synonym.ingredient.inciName;

  // 2. Try trade-name alias lookup (e.g., "Zemea" → "Propanediol")
  const tradeAlias = await prisma.tradeNameAlias.findFirst({
    where: { tradeName: { equals: rawName, mode: "insensitive" } },
  });
  if (tradeAlias) {
    // Verify the canonical INCI name exists in master
    const master = await prisma.ingredientMaster.findFirst({
      where: { inciName: { equals: tradeAlias.canonicalInci, mode: "insensitive" } },
      select: { inciName: true },
    });
    if (master) return master.inciName;
    // Even if not in master, return the canonical name for reference
    return tradeAlias.canonicalInci;
  }

  // 3. Try normalized name match against ingredient master
  const byNormalized = await prisma.ingredientMaster.findFirst({
    where: {
      OR: [
        { inciName: { equals: rawName, mode: "insensitive" } },
        { inciName: { equals: normalized, mode: "insensitive" } },
      ],
    },
    select: { inciName: true },
  });
  if (byNormalized) return byNormalized.inciName;

  // 4. Try CAS-based matching if the row has a CAS number
  // (handled separately in the caller for upload rows)

  // 5. Try stripped name (remove "extract", "oil", "powder" etc.)
  if (stripped !== normalized && stripped.length >= 3) {
    const byStripped = await prisma.ingredientMaster.findFirst({
      where: { inciName: { contains: stripped, mode: "insensitive" } },
      select: { inciName: true },
    });
    if (byStripped) return byStripped.inciName;
  }

  return null;
}

/** Try CAS-based matching against the ingredient master */
async function attemptCasMatch(casNumber: string): Promise<string | null> {
  if (!casNumber?.trim()) return null;
  const normalized = casNumber.replace(/[\s\u2010-\u2015]/g, "-").trim();
  const master = await prisma.ingredientMaster.findFirst({
    where: { casNumber: { equals: normalized, mode: "insensitive" } },
    select: { inciName: true },
  });
  return master?.inciName ?? null;
}

// ── Check: AICIS Scrutiny ──

async function checkAicisScrutiny(
  uploadId: string,
  aicisSnapshotId: string | null,
  strictMode = false,
): Promise<CheckResult> {
  if (!aicisSnapshotId) {
    return {
      key: "aicis_scrutiny",
      label: "AICIS Inventory Scrutiny (Informational)",
      status: "FAIL",
      reason: "No AICIS inventory snapshot is active. Import an AICIS snapshot first.",
      evidenceLinks: [],
      issues: [{ severity: "ERROR", ingredientName: null, message: "No active AICIS inventory snapshot." }],
      evidenceRequired: [],
    };
  }

  const scrutiny = await prisma.uploadAicisScrutinySnapshot.findFirst({
    where: {
      uploadId,
      snapshotId: aicisSnapshotId,
      isActive: true,
    },
    select: {
      id: true,
      status: true,
      totalRows: true,
      foundCount: true,
      notFoundCount: true,
      notListedCount: true,
      needsReviewCount: true,
      missingCasCount: true,
      ambiguousCount: true,
      unmatchedCount: true,
    },
  });

  if (!scrutiny) {
    return {
      key: "aicis_scrutiny",
      label: "AICIS Inventory Scrutiny (Informational)",
      status: "FAIL",
      reason: "No AICIS scrutiny has been run for this upload. Run scrutiny from the Compliance tab.",
      evidenceLinks: [],
      issues: [{ severity: "ERROR", ingredientName: null, message: "AICIS scrutiny not yet run." }],
      evidenceRequired: [],
    };
  }

  const issues: Issue[] = [];
  const evidenceRequired: EvidenceRequirement[] = [];
  const evidenceLinks = [`/aicis/uploads/${uploadId}/latest`];

  // If scrutiny was run, load findings to classify NOT_FOUND items
  if (scrutiny.notFoundCount > 0 || scrutiny.notListedCount > 0 || (scrutiny.needsReviewCount ?? 0) > 0 || scrutiny.missingCasCount > 0 || scrutiny.ambiguousCount > 0) {
    const findings = await prisma.uploadAicisScrutinyRowFinding.findMany({
      where: { scrutinySnapshotId: scrutiny.id },
      include: {
        uploadRow: {
          select: { rawName: true, casNumber: true },
        },
      },
    });

    let hasStandardNotFound = false;

    for (const finding of findings) {
      if (finding.result === "FOUND") continue;

      const ingredientName = finding.uploadRow.rawName;
      const category = categorizeIngredient(ingredientName);

      if (finding.result === "NOT_FOUND") {
        if (category === "STANDARD" && strictMode) {
          hasStandardNotFound = true;
          issues.push({
            severity: "ERROR",
            ingredientName,
            message: `Not found in AICIS Inventory — standard ingredient must be listed (strict mode).`,
          });
        } else if (category === "STANDARD") {
          // Non-strict: standard NOT_FOUND is a warning, not a hard fail
          issues.push({
            severity: "WARNING",
            ingredientName,
            message: `Not found in AICIS Inventory — may require categorisation or exemption evidence.`,
          });
          evidenceRequired.push({
            ingredientName,
            requiredDocuments: [
              "SDS (Safety Data Sheet)",
              "AICIS categorisation evidence or exemption declaration",
            ],
            reason: `Standard ingredient not directly listed in AICIS — evidence needed for categorisation or exemption.`,
          });
        } else {
          // Botanical/blend/polymer NOT_FOUND → NEEDS_REVIEW, not FAIL
          issues.push({
            severity: "WARNING",
            ingredientName,
            message: `${category.toLowerCase()} ingredient not found in AICIS Inventory — may be exempt or listed under different name. Evidence required.`,
          });
          evidenceRequired.push({
            ingredientName,
            requiredDocuments: [
              ...evidenceDocsForCategory(category),
              "AICIS exemption declaration or listed-under evidence",
            ],
            reason: `${category.toLowerCase()} not directly listed in AICIS — evidence needed for exemption or alternative listing.`,
          });
        }
      } else if (finding.result === "NOT_LISTED") {
        // CAS valid on Common Chemistry but not in AICIS — does NOT block approval
        issues.push({
          severity: "INFO",
          ingredientName,
          message: `CAS valid (Common Chemistry) but not found in AICIS Inventory. Does not block approval.`,
        });
      } else if (finding.result === "MISSING_CAS") {
        issues.push({
          severity: "WARNING",
          ingredientName,
          message: `Missing CAS number — could not verify AICIS listing by CAS.`,
        });
        evidenceRequired.push({
          ingredientName,
          requiredDocuments: ["SDS (Safety Data Sheet)", "COA with CAS number"],
          reason: `CAS number needed for AICIS verification.`,
        });
      } else if (finding.result === "AMBIGUOUS") {
        issues.push({
          severity: "WARNING",
          ingredientName,
          message: `Ambiguous match — multiple AICIS entries matched by name. CAS verification required.`,
        });
        evidenceRequired.push({
          ingredientName,
          requiredDocuments: ["COA with CAS number", "Supplier declaration with CAS"],
          reason: `Ambiguous AICIS match — CAS needed to disambiguate.`,
        });
      } else if (finding.result === "NEEDS_REVIEW") {
        // CAS API was unavailable — cannot confirm or deny listing
        issues.push({
          severity: "WARNING",
          ingredientName,
          message: `CAS validation API unavailable — could not verify CAS number. Will be rechecked on next scrutiny run.`,
        });
      }
    }

    // Status logic:
    //   Any standard NOT_FOUND → FAIL
    //   Only botanical/blend/polymer NOT_FOUND + MISSING_CAS + AMBIGUOUS → NEEDS_REVIEW
    if (hasStandardNotFound) {
      return {
        key: "aicis_scrutiny",
        label: "AICIS Inventory Scrutiny (Informational)",
        status: "FAIL",
        reason: `FAIL: ${scrutiny.notFoundCount} ingredient(s) NOT FOUND in AICIS Inventory (includes standard chemicals that must be listed).`,
        evidenceLinks,
        issues,
        evidenceRequired,
      };
    }

    // Blocking items: NOT_FOUND + MISSING_CAS + AMBIGUOUS
    // Non-blocking items: NOT_LISTED + NEEDS_REVIEW (do NOT block approval)
    const blockingCount = scrutiny.notFoundCount + scrutiny.missingCasCount + scrutiny.ambiguousCount;
    const nonBlockingInfoCount = (scrutiny.notListedCount ?? 0) + (scrutiny.needsReviewCount ?? 0);

    if (blockingCount === 0) {
      // Only NOT_LISTED and/or NEEDS_REVIEW items — PASS (does not block approval)
      const infoNotes: string[] = [];
      if ((scrutiny.notListedCount ?? 0) > 0) infoNotes.push(`${scrutiny.notListedCount} CAS valid but not in AICIS`);
      if ((scrutiny.needsReviewCount ?? 0) > 0) infoNotes.push(`${scrutiny.needsReviewCount} pending CAS API verification`);
      return {
        key: "aicis_scrutiny",
        label: "AICIS Inventory Scrutiny (Informational)",
        status: "PASS",
        reason: `PASS: ${scrutiny.foundCount}/${scrutiny.totalRows} confirmed in AICIS.${infoNotes.length > 0 ? ` ${infoNotes.join("; ")}.` : ""}`,
        evidenceLinks,
        issues,
        evidenceRequired,
      };
    }

    return {
      key: "aicis_scrutiny",
      label: "AICIS Inventory Scrutiny (Informational)",
      status: "NEEDS_REVIEW",
      reason: `${scrutiny.foundCount}/${scrutiny.totalRows} confirmed. ${blockingCount} item(s) need review (missing CAS or ambiguous matches).`,
      evidenceLinks,
      issues,
      evidenceRequired,
    };
  }

  // All FOUND
  return {
    key: "aicis_scrutiny",
    label: "AICIS Inventory Scrutiny (Informational)",
    status: "PASS",
    reason: `PASS: ${scrutiny.foundCount}/${scrutiny.totalRows} ingredients confirmed in AICIS Inventory.`,
    evidenceLinks,
    issues: [],
    evidenceRequired: [],
  };
}

// ── Check: Banned/Restricted ──
//
// Two-tier check:
//   1. RestrictedChemicalIndex (offline CSV dataset) — preferred, deterministic
//   2. BannedRestrictedChemical (legacy snapshot) — fallback if no offline dataset
//
// If an active EvidenceSource exists, use RestrictedChemicalIndex only.
// Otherwise, fall back to legacy BannedRestrictedSnapshot-based checking.

async function checkBannedRestricted(
  uploadId: string,
  requestBrSnapshotId: string | null,
): Promise<CheckResult> {
  // ── Phase 0: Check for active offline dataset (RestrictedChemicalIndex) ──
  const activeSource = await prisma.evidenceSource.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, versionLabel: true },
  });

  if (activeSource) {
    return checkBannedRestrictedFromIndex(uploadId, activeSource);
  }

  // ── Fallback: Legacy BannedRestrictedSnapshot-based checking ──
  return checkBannedRestrictedFromSnapshot(uploadId, requestBrSnapshotId);
}

/** Check against RestrictedChemicalIndex (offline dataset). */
async function checkBannedRestrictedFromIndex(
  uploadId: string,
  activeSource: { id: string; name: string; versionLabel: string },
): Promise<CheckResult> {
  const upload = await prisma.formulationUpload.findUnique({
    where: { id: uploadId },
    include: {
      rows: {
        select: {
          id: true,
          rawName: true,
          casNumber: true,
          matchedIngredient: {
            select: { inciName: true, casNumber: true },
          },
        },
      },
    },
  });

  const uploadRows = upload?.rows ?? [];
  const issues: Issue[] = [];
  const evidenceRequired: EvidenceRequirement[] = [];
  const evidenceLinks = [`Dataset: ${activeSource.name} v${activeSource.versionLabel}`];

  // CAS-based check against restricted index
  const bannedByCas: { name: string; cas: string; status: string }[] = [];
  for (const row of uploadRows) {
    const cas = row.casNumber?.trim() || row.matchedIngredient?.casNumber?.trim();
    if (!cas) continue;
    const normalized = cas.replace(/[\s\u2010-\u2015]/g, "-").trim();
    const match = await prisma.restrictedChemicalIndex.findFirst({
      where: { sourceId: activeSource.id, casNo: normalized },
      select: { chemicalName: true, casNo: true, status: true, reason: true },
    });
    if (match && (match.status === "BANNED" || match.status === "RESTRICTED")) {
      const label = match.chemicalName
        ? `${match.chemicalName} (${match.casNo})`
        : match.casNo;
      bannedByCas.push({ name: label, cas: match.casNo, status: match.status });
      issues.push({
        severity: "ERROR",
        ingredientName: row.rawName,
        message: `${match.status} in restricted chemical index (CAS: ${match.casNo}).${match.reason ? ` Reason: ${match.reason}` : ""}`,
      });
    }
  }

  if (bannedByCas.length > 0) {
    return {
      key: "banned_restricted",
      label: "Banned/Restricted Scrutiny",
      status: "FAIL",
      reason: `BLOCKED: ${bannedByCas.length} ingredient(s) found in restricted index: ${bannedByCas.map((b) => `${b.name} [${b.status}]`).join(", ")}`,
      evidenceLinks,
      issues,
      evidenceRequired: [],
    };
  }

  // Check rows without CAS — informational warning only (does NOT block approval)
  const missingCasRows = uploadRows.filter(
    (r) => (!r.casNumber || r.casNumber.trim() === "") && (!r.matchedIngredient?.casNumber || r.matchedIngredient.casNumber.trim() === ""),
  );

  if (missingCasRows.length > 0) {
    for (const row of missingCasRows) {
      issues.push({
        severity: "WARNING",
        ingredientName: row.rawName,
        message: `Missing CAS — upload SDS/COA to complete full verification. Does not block approval.`,
      });
      evidenceRequired.push({
        ingredientName: row.rawName,
        requiredDocuments: ["SDS (Safety Data Sheet)", "COA with CAS number"],
        reason: `CAS number recommended for complete banned/restricted verification.`,
      });
    }

    const casChecked = uploadRows.length - missingCasRows.length;
    return {
      key: "banned_restricted",
      label: "Banned/Restricted Scrutiny",
      status: "PASS",
      reason: `PASS: ${casChecked} CAS number(s) checked against ${activeSource.name} v${activeSource.versionLabel} — none banned/restricted. ${missingCasRows.length} ingredient(s) lack CAS.`,
      evidenceLinks,
      issues,
      evidenceRequired,
    };
  }

  return {
    key: "banned_restricted",
    label: "Banned/Restricted Scrutiny",
    status: "PASS",
    reason: `PASS: ${uploadRows.length} CAS number(s) checked against ${activeSource.name} v${activeSource.versionLabel} — none found in banned/restricted index.`,
    evidenceLinks,
    issues: [],
    evidenceRequired: [],
  };
}

/** Legacy check against BannedRestrictedSnapshot. */
async function checkBannedRestrictedFromSnapshot(
  uploadId: string,
  requestBrSnapshotId: string | null,
): Promise<CheckResult> {
  // Re-resolve to latest complete B/R snapshot
  const latestCompleteBr = await prisma.bannedRestrictedSnapshot.findFirst({
    where: { isComplete: true },
    orderBy: { fetchedAt: "desc" },
    select: { id: true, isComplete: true },
  });

  const brSnapshotId = latestCompleteBr?.id ?? requestBrSnapshotId;

  if (!brSnapshotId) {
    return {
      key: "banned_restricted",
      label: "Banned/Restricted Scrutiny",
      status: "FAIL",
      reason: "No banned/restricted dataset available. Upload an evidence pack CSV via the Restricted Chemicals page.",
      evidenceLinks: [],
      issues: [{ severity: "ERROR", ingredientName: null, message: "No B/R evidence dataset exists. Upload a restricted chemicals CSV." }],
      evidenceRequired: [],
    };
  }

  const brSnap = await prisma.bannedRestrictedSnapshot.findUnique({
    where: { id: brSnapshotId },
    select: { id: true, isComplete: true },
  });

  if (!brSnap || !brSnap.isComplete) {
    return {
      key: "banned_restricted",
      label: "Banned/Restricted Scrutiny",
      status: "NEEDS_REVIEW",
      reason: "B/R snapshot is incomplete — some sources may have failed. Upload additional evidence PDFs or upload a restricted chemicals CSV.",
      evidenceLinks: brSnapshotId ? [`/banned-restricted/records/${brSnapshotId}`] : [],
      issues: [{ severity: "WARNING", ingredientName: null, message: "B/R snapshot incomplete — partial evidence only." }],
      evidenceRequired: [],
    };
  }

  // Load upload rows
  const upload = await prisma.formulationUpload.findUnique({
    where: { id: uploadId },
    include: {
      rows: {
        select: {
          id: true,
          rawName: true,
          casNumber: true,
          matchedIngredient: {
            select: { inciName: true, casNumber: true },
          },
        },
      },
    },
  });

  const uploadRows = upload?.rows ?? [];
  const issues: Issue[] = [];
  const evidenceRequired: EvidenceRequirement[] = [];

  // CAS-based check
  const bannedByCas: { name: string; cas: string }[] = [];
  for (const row of uploadRows) {
    const cas = row.casNumber?.trim() || row.matchedIngredient?.casNumber?.trim();
    if (!cas) continue;
    const normalized = cas.replace(/[\s\u2010-\u2015]/g, "-").trim();
    const match = await prisma.bannedRestrictedChemical.findFirst({
      where: { snapshotId: brSnapshotId, normalizedCasNo: normalized },
      select: { chemicalName: true, normalizedCasNo: true },
    });
    if (match) {
      bannedByCas.push({
        name: match.chemicalName
          ? `${match.chemicalName} (${match.normalizedCasNo})`
          : match.normalizedCasNo,
        cas: match.normalizedCasNo,
      });
      issues.push({
        severity: "ERROR",
        ingredientName: row.rawName,
        message: `FOUND in banned/restricted sources (CAS: ${match.normalizedCasNo}).`,
      });
    }
  }

  if (bannedByCas.length > 0) {
    return {
      key: "banned_restricted",
      label: "Banned/Restricted Scrutiny",
      status: "FAIL",
      reason: `BLOCKED: ${bannedByCas.length} ingredient(s) FOUND in banned/restricted sources: ${bannedByCas.map((b) => b.name).join(", ")}`,
      evidenceLinks: [`/banned-restricted/records/${brSnapshotId}`],
      issues,
      evidenceRequired: [],
    };
  }

  // Name-based check against Poisons Standard
  const poisonsNameEntries = await prisma.bannedRestrictedChemical.findMany({
    where: {
      snapshotId: brSnapshotId,
      normalizedCasNo: { startsWith: "NAME_ONLY:" },
      source: { linkType: "POISONS_STANDARD" },
    },
    select: { chemicalName: true },
  });

  const foundByName: string[] = [];
  if (poisonsNameEntries.length > 0) {
    const poisonsNames = poisonsNameEntries
      .map((e) => e.chemicalName?.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean) as string[];

    for (const row of uploadRows) {
      const ingredientName = (row.rawName ?? "").toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
      if (ingredientName.length < 3) continue;

      const nameFound = poisonsNames.some(
        (pn) => pn === ingredientName || pn.includes(ingredientName) || ingredientName.includes(pn),
      );
      if (nameFound) {
        foundByName.push(row.rawName);
        issues.push({
          severity: "WARNING",
          ingredientName: row.rawName,
          message: `Matched Poisons Standard scheduled substance by name. CAS-level verification recommended.`,
        });
        evidenceRequired.push({
          ingredientName: row.rawName,
          requiredDocuments: ["COA with CAS number", "SDS (Safety Data Sheet)", "Supplier declaration"],
          reason: `Poisons Standard name match — CAS confirmation needed to verify or clear.`,
        });
      }
    }
  }

  if (foundByName.length > 0) {
    return {
      key: "banned_restricted",
      label: "Banned/Restricted Scrutiny",
      status: "NEEDS_REVIEW",
      reason: `${foundByName.length} ingredient(s) matched Poisons Standard by name: ${foundByName.join(", ")}. CAS-level verification required.`,
      evidenceLinks: [`/banned-restricted/records/${brSnapshotId}`],
      issues,
      evidenceRequired,
    };
  }

  // Check rows without CAS — informational warning only (does NOT block approval)
  const missingCasRows = uploadRows.filter(
    (r) => (!r.casNumber || r.casNumber.trim() === "") && (!r.matchedIngredient?.casNumber || r.matchedIngredient.casNumber.trim() === ""),
  );

  if (missingCasRows.length > 0) {
    for (const row of missingCasRows) {
      issues.push({
        severity: "WARNING",
        ingredientName: row.rawName,
        message: `Missing CAS — upload SDS/COA to complete full verification. Does not block approval.`,
      });
      evidenceRequired.push({
        ingredientName: row.rawName,
        requiredDocuments: ["SDS (Safety Data Sheet)", "COA with CAS number"],
        reason: `CAS number recommended for complete banned/restricted verification.`,
      });
    }

    // Missing CAS is informational — still PASS since none of the checked CAS numbers are banned
    const casChecked = uploadRows.length - missingCasRows.length;
    return {
      key: "banned_restricted",
      label: "Banned/Restricted Scrutiny",
      status: "PASS",
      reason: `PASS: ${casChecked} CAS number(s) checked — none banned. ${missingCasRows.length} ingredient(s) lack CAS (${missingCasRows.map((r) => r.rawName).join(", ")}) — upload SDS/COA for complete verification.`,
      evidenceLinks: [`/banned-restricted/records/${brSnapshotId}`],
      issues,
      evidenceRequired,
    };
  }

  // All clear
  return {
    key: "banned_restricted",
    label: "Banned/Restricted Scrutiny",
    status: "PASS",
    reason: `PASS: ${uploadRows.length} CAS number(s) checked — none found in banned/restricted sources.`,
    evidenceLinks: [`/banned-restricted/records/${brSnapshotId}`],
    issues: [],
    evidenceRequired: [],
  };
}

// ── Overall Eligibility Computation ──
//
// Only the Banned/Restricted check gates eligibility.
// Ingredient Matching and AICIS Scrutiny are informational only —
// they display warnings but never block approval.

function computeOverallStatus(checks: CheckResult[]): EligibilityStatus {
  const brCheck = checks.find((c) => c.key === "banned_restricted");
  const brStatus = brCheck?.status ?? "FAIL";

  // Banned/Restricted FAIL → NOT_ELIGIBLE (blocks approval)
  if (brStatus === "FAIL") return "NOT_ELIGIBLE";

  // Banned/Restricted NEEDS_REVIEW → ELIGIBLE_WITH_WARNINGS (blocks approval)
  if (brStatus === "NEEDS_REVIEW") return "ELIGIBLE_WITH_WARNINGS";

  // Banned/Restricted PASS → READY_FOR_APPROVAL
  // (Ingredient Matching and AICIS are informational only)
  return "READY_FOR_APPROVAL";
}

// ── Main Entry Point ──

export async function runEligibilityChecks(
  requestId: string,
  userId: string,
): Promise<EligibilityReport3> {
  const request = await prisma.complianceRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      uploadId: true,
      status: true,
      aicisSnapshotId: true,
      bannedRestrictedSnapshotId: true,
      strictMode: true,
    },
  });
  if (!request) throw new Error("REQUEST_NOT_FOUND");
  if (request.status === "APPROVED") throw new Error("ALREADY_APPROVED");

  // Run all three checks (pass strictMode to AICIS check)
  const ingredientCheck = await checkIngredientMatching(request.uploadId);
  const aicisCheck = await checkAicisScrutiny(request.uploadId, request.aicisSnapshotId, request.strictMode);
  const brCheck = await checkBannedRestricted(request.uploadId, request.bannedRestrictedSnapshotId);

  const checks = [ingredientCheck, aicisCheck, brCheck];

  // Aggregate issues and evidence requirements
  const allIssues = checks.flatMap((c) => c.issues);
  const allEvidenceRequired = checks.flatMap((c) => c.evidenceRequired);

  // Compute overall status
  const eligibilityStatus = computeOverallStatus(checks);

  const report: EligibilityReport3 = {
    eligibilityStatus,
    ingredientMatchingStatus: ingredientCheck.status,
    aicisScrutinyStatus: aicisCheck.status,
    bannedRestrictedStatus: brCheck.status,
    checks,
    issues: allIssues,
    evidenceRequired: allEvidenceRequired,
    checkedAt: new Date().toISOString(),
  };

  // Persist to DB
  // NOT_ELIGIBLE / ELIGIBLE_WITH_WARNINGS → stay in DRAFT (not ready)
  // READY_FOR_APPROVAL → move to IN_REVIEW (awaiting Uma's approval)
  const newStatus = eligibilityStatus === "READY_FOR_APPROVAL" ? "IN_REVIEW" : "DRAFT";

  await prisma.complianceRequest.update({
    where: { id: requestId },
    data: {
      eligibilityStatus,
      ingredientMatchingStatus: ingredientCheck.status,
      aicisScrutinyStatus: aicisCheck.status,
      bannedRestrictedStatus: brCheck.status,
      issuesJson: allIssues as object[],
      evidenceRequiredJson: allEvidenceRequired as object[],
      checkedAt: new Date(),
      checkedByUserId: userId,
      // Backward compat: also update legacy fields
      eligibilityReportJson: report as object,
      eligibleAt: eligibilityStatus !== "NOT_ELIGIBLE" ? new Date() : null,
      status: newStatus as "DRAFT" | "IN_REVIEW",
    },
  });

  logger.info({
    event: "eligibility_check_complete",
    requestId,
    eligibilityStatus,
    ingredientMatching: ingredientCheck.status,
    aicisScrutiny: aicisCheck.status,
    bannedRestricted: brCheck.status,
    issueCount: allIssues.length,
    evidenceCount: allEvidenceRequired.length,
  });

  // Write audit log events
  const auditBase = {
    actorUserId: userId,
    entityType: "compliance_request",
    entityId: requestId,
    requestId: `eligibility-${requestId}-${Date.now()}`,
  };

  await writeAuditLog({
    ...auditBase,
    action: "INGREDIENT_MATCH_RUN",
    metadata: { status: ingredientCheck.status, issueCount: ingredientCheck.issues.length },
  });

  await writeAuditLog({
    ...auditBase,
    action: "AICIS_SCRUTINY_RUN",
    metadata: { status: aicisCheck.status, issueCount: aicisCheck.issues.length },
  });

  await writeAuditLog({
    ...auditBase,
    action: "BANNED_RESTRICTED_CHECK_RUN",
    metadata: { status: brCheck.status, issueCount: brCheck.issues.length },
  });

  return report;
}
