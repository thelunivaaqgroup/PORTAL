import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { lookupCasDetailBatch, isValidCasChecksum } from "../services/commonChemistry.js";

// ── Normalization (must match importer logic exactly) ──

/** Unicode dash codepoints: en-dash, em-dash, figure-dash, minus-sign, etc. */
const UNICODE_DASH_RE = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;

function normalizeCas(cas: string | null | undefined): string | null {
  if (!cas) return null;
  let cleaned = cas.trim().replace(/\s/g, "");
  // Replace unicode dashes with ASCII hyphen
  cleaned = cleaned.replace(UNICODE_DASH_RE, "-");
  return cleaned || null;
}

/** CAS pattern for validation */
const CAS_PATTERN = /^\d{2,7}-\d{2}-\d$/;

/**
 * Split a raw CAS string that may contain multiple CAS numbers
 * (comma, semicolon, newline delimited). Returns validated tokens.
 * Handles unicode dashes by normalizing before pattern matching.
 */
function splitCasTokens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n\r]+/)
    .map((t) => {
      let s = t.trim().replace(/\s/g, "");
      // Replace unicode dashes with ASCII hyphen
      s = s.replace(UNICODE_DASH_RE, "-");
      return s;
    })
    .filter((t) => CAS_PATTERN.test(t));
}

/**
 * Normalize a name for matching: lowercase, collapse whitespace,
 * remove parenthetical suffixes, trim.
 */
function normalizeNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ── Snapshot queries ──

export async function getLatestSnapshot() {
  return prisma.aicisInventorySnapshot.findFirst({
    orderBy: { importedAt: "desc" },
    include: {
      _count: { select: { chemicals: true } },
    },
  });
}

export async function getActiveSnapshot(regionCode: string) {
  return prisma.aicisInventorySnapshot.findFirst({
    where: { regionCode, isActive: true },
    include: {
      importedBy: { select: { id: true, fullName: true, email: true } },
      _count: { select: { chemicals: true } },
    },
  });
}

export async function getChemicalById(chemicalId: string) {
  return prisma.aicisInventoryChemical.findUnique({
    where: { id: chemicalId },
    include: {
      snapshot: {
        select: {
          id: true,
          versionName: true,
          regionCode: true,
          sourceFileName: true,
          asOfDate: true,
          importedAt: true,
        },
      },
    },
  });
}

// ── Scrutiny ──

export interface ScrutinyResult {
  scrutinySnapshotId: string;
  status: string;
  totalRows: number;
  foundCount: number;
  notFoundCount: number;
  notListedCount: number;
  needsReviewCount: number;
  missingCasCount: number;
  ambiguousCount: number;
}

/**
 * Enhanced AICIS scrutiny with multi-level matching.
 *
 * For EVERY upload row:
 *   1. CAS exact match (preferred): parse CAS → look up in AICIS snapshot
 *   2. Name match (fallback): normalize ingredient name → match against normalizedApprovedName
 *   3. Synonym match (fallback): look up IngredientSynonym → get canonical INCI → match
 *   4. No match → NOT_FOUND (if CAS was provided) or MISSING_CAS (if no CAS)
 *
 * Results:
 *   FOUND        — matched via CAS, NAME, or SYNONYM
 *   NOT_FOUND    — no match found despite having identifiers
 *   MISSING_CAS  — no valid CAS and no name match
 *   AMBIGUOUS    — multiple conflicting matches found by name
 */
export async function runAicisScrutinyForUpload(
  uploadId: string,
  regionCode: string,
  actorUserId: string,
): Promise<ScrutinyResult> {
  // 1) Get active AICIS snapshot for region (fallback to latest)
  const active = await getActiveSnapshot(regionCode);
  const snapshot = active ?? (await getLatestSnapshot());
  if (!snapshot) {
    throw new Error("NO_AICIS_SNAPSHOT");
  }

  // Load snapshot source file name for evidence
  const snapshotFull = await prisma.aicisInventorySnapshot.findUnique({
    where: { id: snapshot.id },
    select: { sourceFileName: true, versionName: true, asOfDate: true },
  });

  // 2) Load upload rows
  const upload = await prisma.formulationUpload.findUnique({
    where: { id: uploadId },
    include: {
      rows: {
        select: {
          id: true,
          rawName: true,
          casNumber: true,
          inciSuggestion: true,
          matchedIngredientId: true,
          matchedIngredient: {
            select: { inciName: true, casNumber: true },
          },
        },
      },
    },
  });
  if (!upload) {
    throw new Error("UPLOAD_NOT_FOUND");
  }

  // 3) Evaluate each row with multi-level matching
  type FindingData = {
    uploadRowId: string;
    result: "FOUND" | "NOT_FOUND" | "NOT_LISTED" | "NEEDS_REVIEW" | "MISSING_CAS" | "AMBIGUOUS";
    matchMethod: "CAS" | "NAME" | "SYNONYM" | "NONE";
    casUsed: string | null;
    aicisChemicalId: string | null;
    matchedCrNo: string | null;
    matchedCasNo: string | null;
    matchedApprovedName: string | null;
    evidenceJson: object;
    commonChemistryName: string | null;
    commonChemistryUrl: string | null;
    commonChemistryStatus: string | null;
    commonChemistryReason: string | null;
    commonChemistryFetchedAt: Date | null;
  };

  const findings: FindingData[] = [];

  /** Helper: build a finding with CC fields defaulting to null */
  function makeFinding(
    base: Omit<FindingData, "commonChemistryName" | "commonChemistryUrl" | "commonChemistryStatus" | "commonChemistryReason" | "commonChemistryFetchedAt">,
  ): FindingData {
    return {
      ...base,
      commonChemistryName: null,
      commonChemistryUrl: null,
      commonChemistryStatus: null,
      commonChemistryReason: null,
      commonChemistryFetchedAt: null,
    };
  }

  for (const row of upload.rows) {
    // ── Level 1: CAS exact match ──
    const casTokens = splitCasTokens(row.casNumber);
    const singleCas = normalizeCas(row.casNumber);
    if (singleCas && CAS_PATTERN.test(singleCas) && !casTokens.includes(singleCas)) {
      casTokens.push(singleCas);
    }

    // Also try matched ingredient's CAS if available
    if (row.matchedIngredient?.casNumber) {
      const matchedCasTokens = splitCasTokens(row.matchedIngredient.casNumber);
      for (const t of matchedCasTokens) {
        if (!casTokens.includes(t)) casTokens.push(t);
      }
    }

    if (casTokens.length > 0) {
      const casMatches = await prisma.aicisInventoryChemical.findMany({
        where: {
          snapshotId: snapshot.id,
          normalizedCasNo: { in: casTokens },
        },
        select: {
          id: true,
          crNo: true,
          casNo: true,
          approvedName: true,
          normalizedCasNo: true,
        },
      });

      if (casMatches.length > 0) {
        const match = casMatches[0];
        logger.info({ event: "CAS_LOOKUP_DECISION", ingredientName: row.rawName, cas: match.normalizedCasNo, reason: "FOUND in internal AICIS inventory — skipping CC lookup" });
        findings.push(makeFinding({
          uploadRowId: row.id,
          result: "FOUND",
          matchMethod: "CAS",
          casUsed: match.normalizedCasNo,
          aicisChemicalId: match.id,
          matchedCrNo: match.crNo,
          matchedCasNo: match.casNo,
          matchedApprovedName: match.approvedName,
          evidenceJson: {
            evidenceType: "INTERNAL_SNAPSHOT",
            evidenceUrl: `/aicis-inventory/chemicals/${match.id}`,
            evidenceSnapshotId: snapshot.id,
            evidenceSourceFileName: snapshotFull?.sourceFileName ?? null,
            notes: `CAS ${match.normalizedCasNo} found in AICIS Inventory as "${match.approvedName}" (CR No. ${match.crNo})`,
          },
        }));
        continue;
      }
    }

    // ── Level 2: Name match against normalizedApprovedName ──
    const ingredientName =
      row.matchedIngredient?.inciName ?? row.inciSuggestion ?? row.rawName;
    const normalizedName = normalizeNameForMatch(ingredientName);

    if (normalizedName.length >= 2) {
      const nameMatches = await prisma.aicisInventoryChemical.findMany({
        where: {
          snapshotId: snapshot.id,
          normalizedApprovedName: normalizedName,
        },
        select: {
          id: true,
          crNo: true,
          casNo: true,
          approvedName: true,
          normalizedCasNo: true,
        },
      });

      if (nameMatches.length === 1) {
        const match = nameMatches[0];
        findings.push(makeFinding({
          uploadRowId: row.id,
          result: "FOUND",
          matchMethod: "NAME",
          casUsed: match.normalizedCasNo,
          aicisChemicalId: match.id,
          matchedCrNo: match.crNo,
          matchedCasNo: match.casNo,
          matchedApprovedName: match.approvedName,
          evidenceJson: {
            evidenceType: "INTERNAL_SNAPSHOT",
            evidenceUrl: `/aicis-inventory/chemicals/${match.id}`,
            evidenceSnapshotId: snapshot.id,
            evidenceSourceFileName: snapshotFull?.sourceFileName ?? null,
            notes: `Name "${ingredientName}" matched AICIS approved name "${match.approvedName}" (CR No. ${match.crNo})`,
          },
        }));
        continue;
      }

      if (nameMatches.length > 1) {
        // Multiple name matches — ambiguous
        findings.push(makeFinding({
          uploadRowId: row.id,
          result: "AMBIGUOUS",
          matchMethod: "NAME",
          casUsed: null,
          aicisChemicalId: null,
          matchedCrNo: null,
          matchedCasNo: null,
          matchedApprovedName: nameMatches.map((m) => m.approvedName).join("; "),
          evidenceJson: {
            evidenceType: "INTERNAL_SNAPSHOT",
            evidenceUrl: null,
            evidenceSnapshotId: snapshot.id,
            evidenceSourceFileName: snapshotFull?.sourceFileName ?? null,
            notes: `Name "${ingredientName}" matched ${nameMatches.length} AICIS entries — ambiguous. CAS verification required.`,
            ambiguousMatches: nameMatches.map((m) => ({
              crNo: m.crNo,
              approvedName: m.approvedName,
              casNo: m.casNo,
            })),
          },
        }));
        continue;
      }
    }

    // ── Level 3: Synonym match via IngredientSynonym dictionary ──
    if (normalizedName.length >= 2) {
      // Look for a synonym that matches this ingredient name
      const synonym = await prisma.ingredientSynonym.findFirst({
        where: {
          name: {
            equals: ingredientName,
            mode: "insensitive",
          },
        },
        include: {
          ingredient: {
            select: { inciName: true, casNumber: true },
          },
        },
      });

      if (synonym?.ingredient) {
        // We found a canonical ingredient via synonym — now match its CAS or name in AICIS
        const canonicalCas = normalizeCas(synonym.ingredient.casNumber);
        const canonicalName = normalizeNameForMatch(synonym.ingredient.inciName);

        let synMatch = null;

        // Try CAS first
        if (canonicalCas && CAS_PATTERN.test(canonicalCas)) {
          synMatch = await prisma.aicisInventoryChemical.findFirst({
            where: {
              snapshotId: snapshot.id,
              normalizedCasNo: canonicalCas,
            },
            select: {
              id: true,
              crNo: true,
              casNo: true,
              approvedName: true,
              normalizedCasNo: true,
            },
          });
        }

        // Then try name
        if (!synMatch && canonicalName.length >= 2) {
          synMatch = await prisma.aicisInventoryChemical.findFirst({
            where: {
              snapshotId: snapshot.id,
              normalizedApprovedName: canonicalName,
            },
            select: {
              id: true,
              crNo: true,
              casNo: true,
              approvedName: true,
              normalizedCasNo: true,
            },
          });
        }

        if (synMatch) {
          findings.push(makeFinding({
            uploadRowId: row.id,
            result: "FOUND",
            matchMethod: "SYNONYM",
            casUsed: synMatch.normalizedCasNo,
            aicisChemicalId: synMatch.id,
            matchedCrNo: synMatch.crNo,
            matchedCasNo: synMatch.casNo,
            matchedApprovedName: synMatch.approvedName,
            evidenceJson: {
              evidenceType: "INTERNAL_SNAPSHOT",
              evidenceUrl: `/aicis-inventory/chemicals/${synMatch.id}`,
              evidenceSnapshotId: snapshot.id,
              evidenceSourceFileName: snapshotFull?.sourceFileName ?? null,
              notes: `"${ingredientName}" → synonym of "${synonym.ingredient.inciName}" → AICIS "${synMatch.approvedName}" (CR No. ${synMatch.crNo})`,
              synonymChain: {
                originalName: ingredientName,
                canonicalInci: synonym.ingredient.inciName,
                aicisApprovedName: synMatch.approvedName,
              },
            },
          }));
          continue;
        }
      }
    }

    // ── No match found ──
    if (casTokens.length === 0) {
      findings.push(makeFinding({
        uploadRowId: row.id,
        result: "MISSING_CAS",
        matchMethod: "NONE",
        casUsed: null,
        aicisChemicalId: null,
        matchedCrNo: null,
        matchedCasNo: null,
        matchedApprovedName: null,
        evidenceJson: {
          evidenceType: "INTERNAL_SNAPSHOT",
          evidenceUrl: null,
          evidenceSnapshotId: snapshot.id,
          evidenceSourceFileName: snapshotFull?.sourceFileName ?? null,
          notes: `Row "${row.rawName}" has no valid CAS number and no name/synonym match found (raw CAS: ${row.casNumber ?? "empty"})`,
        },
      }));
    } else {
      // Mark as pending Common Chemistry validation (resolved below)
      findings.push(makeFinding({
        uploadRowId: row.id,
        result: "NOT_FOUND", // placeholder — may become NOT_LISTED after Common Chemistry check
        matchMethod: "CAS",
        casUsed: casTokens[0],
        aicisChemicalId: null,
        matchedCrNo: null,
        matchedCasNo: null,
        matchedApprovedName: null,
        evidenceJson: {
          evidenceType: "INTERNAL_SNAPSHOT",
          evidenceUrl: null,
          evidenceSnapshotId: snapshot.id,
          evidenceSourceFileName: snapshotFull?.sourceFileName ?? null,
          notes: `CAS ${casTokens.join(", ")} and name "${ingredientName}" not found in AICIS Inventory`,
        },
      }));
    }
  }

  // 4a) CAS fallback for NOT_FOUND rows
  //
  // Enterprise rules:
  //   1. CAS validity = checksum validation ONLY (local, no API).
  //   2. Invalid checksum → NOT_FOUND ("Invalid CAS").
  //   3. Valid checksum + not in AICIS → call CommonChemistry /detail for canonical name:
  //        SUCCESS        → NOT_LISTED + canonicalName
  //        NOT_IN_DATABASE → NOT_LISTED (CAS valid by checksum, just not in CC)
  //        API_ERROR       → NEEDS_REVIEW (never NOT_FOUND from API failure)
  //
  // NEVER classify as NOT_FOUND due to: 401, 403, 429, 5xx, timeout, missing API key, name mismatch.
  const notFoundFindings = findings.filter(
    (f) => f.result === "NOT_FOUND" && f.casUsed,
  );

  if (notFoundFindings.length > 0) {
    // Step 1: Separate by checksum validity
    const validChecksumFindings: typeof notFoundFindings = [];

    for (const finding of notFoundFindings) {
      if (isValidCasChecksum(finding.casUsed!)) {
        validChecksumFindings.push(finding);
      } else {
        // Invalid checksum → stays NOT_FOUND (truly invalid CAS)
        logger.info({ event: "CAS_LOOKUP_DECISION", ingredientName: upload.rows.find((r) => r.id === finding.uploadRowId)?.rawName ?? "unknown", cas: finding.casUsed, reason: "Invalid CAS checksum — skipping CC lookup" });
        finding.evidenceJson = {
          evidenceType: "CHECKSUM_VALIDATION",
          evidenceUrl: null,
          evidenceSnapshotId: snapshot.id,
          evidenceSourceFileName: snapshotFull?.sourceFileName ?? null,
          notes: `CAS ${finding.casUsed} has an invalid checksum — not a valid CAS Registry Number.`,
          casValidity: "INVALID",
          canonicalName: null,
          canonicalSource: null,
          reason: "CAS checksum validation failed",
        };
      }
    }

    // Step 2: Valid checksum findings → call CommonChemistry for enrichment
    if (validChecksumFindings.length > 0) {
      const casNumbersToCheck = validChecksumFindings.map((f) => f.casUsed!);

      // Log the decision to call CC for each CAS
      for (const finding of validChecksumFindings) {
        const rowName = upload.rows.find((r) => r.id === finding.uploadRowId)?.rawName ?? "unknown";
        logger.info({
          event: "CAS_LOOKUP_DECISION",
          ingredientName: rowName,
          cas: finding.casUsed,
          reason: "Not found in internal AICIS inventory, valid checksum — calling CAS Common Chemistry",
        });
      }

      const ccResults = await lookupCasDetailBatch(casNumbersToCheck);

      for (const finding of validChecksumFindings) {
        const ccResult = ccResults.get(finding.casUsed!);
        const ccHttpStatus = ccResult?.httpStatus ?? null;
        logger.info({ event: "CAS_LOOKUP_HTTP", cas: finding.casUsed, statusCode: ccHttpStatus });

        if (!ccResult || ccResult.commonChemistryStatus === "NEEDS_REVIEW") {
          // API unreachable (401/403/429/timeout/network) → NEEDS_REVIEW
          // CAS is valid by checksum — NEVER mark as NOT_FOUND from network issues
          finding.result = "NEEDS_REVIEW";
          finding.commonChemistryName = null;
          finding.commonChemistryUrl = ccResult?.commonChemistryUrl ?? null;
          finding.commonChemistryStatus = "NEEDS_REVIEW";
          finding.commonChemistryReason = ccResult?.commonChemistryReason ?? "CommonChemistry unreachable";
          finding.commonChemistryFetchedAt = new Date();
          finding.evidenceJson = {
            evidenceType: "EXTERNAL_VALIDATION",
            status: "NEEDS_REVIEW",
            source: "CAS_COMMON_CHEMISTRY",
            evidenceUrl: ccResult?.commonChemistryUrl ?? null,
            evidenceSnapshotId: snapshot.id,
            evidenceSourceFileName: snapshotFull?.sourceFileName ?? null,
            notes: `CAS ${finding.casUsed} passes checksum validation but CommonChemistry lookup failed. Try again later.`,
            casValidity: "VALID",
            canonicalName: null,
            canonicalSource: "commonchemistry.cas.org",
            reason: `Lookup failed: ${ccResult?.commonChemistryReason ?? "CommonChemistry unreachable"}`,
          };
          logger.info({ event: "CAS_CC_FAILED", cas: finding.casUsed, httpStatus: ccHttpStatus, reason: ccResult?.commonChemistryReason });
        } else if (ccResult.commonChemistryStatus === "FOUND") {
          // CC returned a valid record → FOUND via CAS Common Chemistry
          finding.result = "FOUND";
          finding.matchMethod = "CAS";
          finding.commonChemistryName = ccResult.commonChemistryName;
          finding.commonChemistryUrl = ccResult.commonChemistryUrl;
          finding.commonChemistryStatus = ccResult.commonChemistryStatus;
          finding.commonChemistryReason = ccResult.commonChemistryReason;
          finding.commonChemistryFetchedAt = new Date();
          finding.evidenceJson = {
            evidenceType: "EXTERNAL_VALIDATION",
            status: "FOUND_EXTERNAL",
            source: "CAS_COMMON_CHEMISTRY",
            officialName: ccResult.commonChemistryName,
            url: ccResult.commonChemistryUrl,
            evidenceUrl: ccResult.commonChemistryUrl,
            evidenceSnapshotId: snapshot.id,
            evidenceSourceFileName: snapshotFull?.sourceFileName ?? null,
            notes: `Not in internal inventory, found in CAS Common Chemistry as: "${ccResult.commonChemistryName}"`,
            casValidity: "VALID",
            canonicalName: ccResult.commonChemistryName,
            canonicalSource: "commonchemistry.cas.org",
            reason: `Not in internal inventory, found in CAS Common Chemistry as: "${ccResult.commonChemistryName}"`,
          };
          logger.info({ event: "CAS_LOOKUP_FOUND", cas: finding.casUsed, officialName: ccResult.commonChemistryName, source: "CAS_COMMON_CHEMISTRY" });
        } else {
          // CC returned NOT_FOUND (HTTP 404) → NOT_FOUND
          // Both internal DB AND CAS Common Chemistry confirm no result
          finding.result = "NOT_FOUND";
          finding.commonChemistryName = null;
          finding.commonChemistryUrl = ccResult.commonChemistryUrl;
          finding.commonChemistryStatus = ccResult.commonChemistryStatus;
          finding.commonChemistryReason = ccResult.commonChemistryReason;
          finding.commonChemistryFetchedAt = new Date();
          finding.evidenceJson = {
            evidenceType: "EXTERNAL_VALIDATION",
            status: "NOT_FOUND",
            source: "CAS_COMMON_CHEMISTRY",
            evidenceUrl: ccResult.commonChemistryUrl,
            evidenceSnapshotId: snapshot.id,
            evidenceSourceFileName: snapshotFull?.sourceFileName ?? null,
            notes: `CAS ${finding.casUsed} not found in internal inventory and not found in CAS Common Chemistry (HTTP 404).`,
            casValidity: "VALID",
            canonicalName: null,
            canonicalSource: null,
            reason: "Not in internal inventory and not found on CAS Common Chemistry (HTTP 404)",
          };
          logger.info({ event: "CAS_CC_NOT_FOUND", cas: finding.casUsed });
        }
      }
    }
  }

  // 4b) Compute counts & overall status
  const foundCount = findings.filter((f) => f.result === "FOUND").length;
  const notFoundCount = findings.filter((f) => f.result === "NOT_FOUND").length;
  const notListedCount = findings.filter((f) => f.result === "NOT_LISTED").length;
  const needsReviewCount = findings.filter((f) => f.result === "NEEDS_REVIEW").length;
  const missingCasCount = findings.filter((f) => f.result === "MISSING_CAS").length;
  const ambiguousCount = findings.filter((f) => f.result === "AMBIGUOUS").length;
  const externalFoundCount = findings.filter(
    (f) => f.result === "FOUND" && (f.evidenceJson as Record<string, unknown>)?.evidenceType === "EXTERNAL_VALIDATION",
  ).length;
  const totalRows = findings.length;

  // Status logic:
  //   FAIL: any NOT_FOUND (CAS truly not found — internal DB miss AND CC 404)
  //   NEEDS_REVIEW: any external CC FOUND, NEEDS_REVIEW (CC lookup failed), MISSING_CAS, or AMBIGUOUS
  //   PASS: all FOUND via internal DB only
  let status: string;
  if (notFoundCount > 0) {
    status = "FAIL";
  } else if (needsReviewCount > 0 || missingCasCount > 0 || ambiguousCount > 0 || externalFoundCount > 0) {
    status = "NEEDS_REVIEW";
  } else {
    status = "PASS";
  }

  // 5) Persist (deactivate previous for same upload+region, create new)
  const scrutinySnapshot = await prisma.$transaction(async (tx) => {
    // Deactivate previous active scrutiny for this upload+region
    await tx.uploadAicisScrutinySnapshot.updateMany({
      where: { uploadId, regionCode, isActive: true },
      data: { isActive: false },
    });

    const snap = await tx.uploadAicisScrutinySnapshot.create({
      data: {
        uploadId,
        snapshotId: snapshot.id,
        regionCode,
        status,
        totalRows,
        foundCount,
        notFoundCount,
        notListedCount,
        needsReviewCount,
        missingCasCount,
        ambiguousCount,
        unmatchedCount: 0,
        isActive: true,
        createdByUserId: actorUserId,
      },
    });

    // Bulk insert findings in chunks
    const CHUNK_SIZE = 500;
    for (let i = 0; i < findings.length; i += CHUNK_SIZE) {
      const chunk = findings.slice(i, i + CHUNK_SIZE);
      await tx.uploadAicisScrutinyRowFinding.createMany({
        data: chunk.map((f) => ({
          scrutinySnapshotId: snap.id,
          ...f,
        })),
      });
    }

    return snap;
  });

  logger.info({
    event: "aicis_scrutiny_complete",
    uploadId,
    regionCode,
    status,
    totalRows,
    foundCount,
    notFoundCount,
    notListedCount,
    needsReviewCount,
    missingCasCount,
    ambiguousCount,
  });

  return {
    scrutinySnapshotId: scrutinySnapshot.id,
    status,
    totalRows,
    foundCount,
    notFoundCount,
    notListedCount,
    needsReviewCount,
    missingCasCount,
    ambiguousCount,
  };
}

export async function getLatestScrutinyForUpload(
  uploadId: string,
  regionCode: string,
) {
  return prisma.uploadAicisScrutinySnapshot.findFirst({
    where: { uploadId, regionCode, isActive: true },
    orderBy: { createdAt: "desc" },
    include: {
      snapshot: {
        select: {
          versionName: true,
          asOfDate: true,
          sourceFileName: true,
        },
      },
      findings: {
        include: {
          uploadRow: {
            select: {
              id: true,
              rawName: true,
              inciSuggestion: true,
              casNumber: true,
              matchedIngredient: {
                select: { inciName: true, casNumber: true },
              },
            },
          },
        },
      },
    },
  });
}
