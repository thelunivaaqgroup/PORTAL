import { prisma } from "../prisma.js";
import type {
  BannedRestrictedSnapshotSummary,
  BannedRestrictedIngredientOutcome,
  BannedRestrictedChemicalInfo,
} from "./bannedRestricted.types.js";
import { SOURCE_OF_TRUTH_URLS } from "./syncBannedRestricted.js";

const HUB_URL =
  "https://www.industrialchemicals.gov.au/chemical-information/banned-or-restricted-chemicals";

/** Normalize a CAS string: trim, collapse spaces, normalize unicode hyphens. */
function normalizeCas(raw: string): string {
  return raw
    .trim()
    .replace(/\s/g, "")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, "-");
}

/** Normalize a name for comparison: lowercase, collapse whitespace, remove non-alphanumeric. */
function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Query functions ──

export async function getSnapshotSummary(
  snapshotId: string,
): Promise<BannedRestrictedSnapshotSummary> {
  const snap = await prisma.bannedRestrictedSnapshot.findUnique({
    where: { id: snapshotId },
    include: {
      sources: { orderBy: { fetchedAt: "asc" } },
      chemicals: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!snap) throw new Error("SNAPSHOT_NOT_FOUND");

  const successSources = snap.sources.filter(
    (s) => s.fetchStatus === "SUCCESS",
  );
  const failedSources = snap.sources.filter(
    (s) => s.fetchStatus === "FAILED",
  );

  return {
    id: snap.id,
    sourceUrl: snap.sourceUrl,
    fetchedAt: snap.fetchedAt.toISOString(),
    contentHash: snap.contentHash,
    isComplete: snap.isComplete,
    notes: snap.notes,
    sourcesTotal: snap.sources.length,
    sourcesSuccess: successSources.length,
    sourcesFailed: failedSources.length,
    chemicalsCount: snap.chemicals.length,
    sources: snap.sources.map((s) => ({
      id: s.id,
      sourceName: s.sourceName,
      sourceUrl: s.sourceUrl,
      linkType: s.linkType,
      fetchStatus: s.fetchStatus,
      fetchedAt: s.fetchedAt.toISOString(),
      contentHash: s.contentHash,
      rawContentSize: s.rawContentSize,
      errorMessage: s.errorMessage,
    })),
    chemicals: snap.chemicals.map((c) => ({
      id: c.id,
      sourceId: c.sourceId,
      normalizedCasNo: c.normalizedCasNo,
      chemicalName: c.chemicalName,
      matchText: c.matchText,
      evidenceUrl: c.evidenceUrl,
    })),
  };
}

/**
 * Get the latest COMPLETE snapshot. This is the deterministic source of truth.
 * Only returns snapshots where isComplete=true.
 */
export async function getLatestCompleteSnapshot(): Promise<BannedRestrictedSnapshotSummary | null> {
  const snap = await prisma.bannedRestrictedSnapshot.findFirst({
    where: { isComplete: true },
    orderBy: { fetchedAt: "desc" },
    select: { id: true },
  });
  if (!snap) return null;
  return getSnapshotSummary(snap.id);
}

/**
 * Get the latest snapshot regardless of completeness (for backward compat).
 */
export async function getLatestSnapshot(): Promise<BannedRestrictedSnapshotSummary | null> {
  const snap = await prisma.bannedRestrictedSnapshot.findFirst({
    orderBy: { fetchedAt: "desc" },
    select: { id: true },
  });
  if (!snap) return null;
  return getSnapshotSummary(snap.id);
}

export async function getSnapshotById(
  snapshotId: string,
): Promise<BannedRestrictedSnapshotSummary | null> {
  try {
    return await getSnapshotSummary(snapshotId);
  } catch {
    return null;
  }
}

export async function findChemicalsByCas(
  casNo: string,
): Promise<BannedRestrictedChemicalInfo[]> {
  const normalized = normalizeCas(casNo);
  const chemicals = await prisma.bannedRestrictedChemical.findMany({
    where: { normalizedCasNo: normalized },
    orderBy: { createdAt: "desc" },
  });
  return chemicals.map((c) => ({
    id: c.id,
    sourceId: c.sourceId,
    normalizedCasNo: c.normalizedCasNo,
    chemicalName: c.chemicalName,
    matchText: c.matchText,
    evidenceUrl: c.evidenceUrl,
  }));
}

export async function getChemicalById(
  chemicalId: string,
): Promise<BannedRestrictedChemicalInfo | null> {
  const c = await prisma.bannedRestrictedChemical.findUnique({
    where: { id: chemicalId },
  });
  if (!c) return null;
  return {
    id: c.id,
    sourceId: c.sourceId,
    normalizedCasNo: c.normalizedCasNo,
    chemicalName: c.chemicalName,
    matchText: c.matchText,
    evidenceUrl: c.evidenceUrl,
  };
}

/**
 * Evaluate a single ingredient against banned/restricted data.
 *
 * DETERMINISTIC STATUS RULES:
 *   CANNOT_CHECK   — No complete snapshot exists at all
 *   NEEDS_REVIEW   — Complete snapshot exists but ingredient has missing/invalid CAS
 *   FOUND          — CAS found in indexed banned/restricted chemicals
 *   FOUND_BY_NAME  — Ingredient name matched a Poisons Standard name-only entry
 *   NOT_LISTED     — CAS not found in any indexed source (snapshot is complete);
 *                    "No evidence found in indexed sources; not a safety confirmation"
 */
export async function evaluateIngredient(
  casNo: string | null,
  ingredientName: string | null,
  latestCompleteSnapshotId: string | null,
): Promise<BannedRestrictedIngredientOutcome> {
  // ── No complete snapshot at all ──
  if (!latestCompleteSnapshotId) {
    return {
      status: "CANNOT_CHECK",
      reason: "No complete banned/restricted evidence snapshot available. Import evidence artifacts or run a web sync.",
      evidenceLinks: SOURCE_OF_TRUTH_URLS,
      matchMethod: "NONE",
    };
  }

  const snapshot = await prisma.bannedRestrictedSnapshot.findUnique({
    where: { id: latestCompleteSnapshotId },
    select: { isComplete: true, sourceUrl: true, notes: true },
  });

  if (!snapshot || !snapshot.isComplete) {
    return {
      status: "CANNOT_CHECK",
      reason: "No complete evidence snapshot available.",
      evidenceLinks: SOURCE_OF_TRUTH_URLS,
      matchMethod: "NONE",
    };
  }

  // ── CAS-based check ──
  const hasCas = casNo && casNo.trim();
  let normalized: string | null = null;
  let casValid = false;

  if (hasCas) {
    normalized = normalizeCas(casNo!);
    casValid = /^\d{2,7}-\d{2}-\d$/.test(normalized);
  }

  if (casValid && normalized) {
    // Look up CAS in chemicals for this snapshot
    const chemicals = await prisma.bannedRestrictedChemical.findMany({
      where: {
        snapshotId: latestCompleteSnapshotId,
        normalizedCasNo: normalized,
      },
      include: {
        source: { select: { sourceName: true, sourceUrl: true, linkType: true } },
      },
    });

    if (chemicals.length > 0) {
      const isUpstreamSourced = chemicals.some((c) =>
        ["ROTTERDAM_PIC", "STOCKHOLM_POP", "MINAMATA_TREATY"].includes(c.source.linkType),
      );
      const sourceNote = isUpstreamSourced ? " (from upstream treaty sources)" : "";

      return {
        status: "FOUND",
        reason: `CAS ${normalized} found in ${chemicals.length} evidence source(s)${sourceNote}.`,
        evidenceLinks: [
          { label: "AICIS Hub Page", url: snapshot.sourceUrl },
          ...chemicals.map((c) => ({
            label: c.source.sourceName,
            url: c.evidenceUrl,
          })),
          {
            label: "View record",
            url: `/banned-restricted/records/${latestCompleteSnapshotId}`,
          },
        ],
        matchedSources: chemicals.map((c) => ({
          sourceName: c.source.sourceName,
          sourceUrl: c.source.sourceUrl,
          matchText: c.matchText,
        })),
        matchMethod: "CAS",
      };
    }
  }

  // ── Name-based check (Poisons Standard name-only entries) ──
  if (ingredientName && ingredientName.trim()) {
    const normalizedIngName = normalizeName(ingredientName);

    if (normalizedIngName.length >= 3) {
      // Look for Poisons Standard name-only entries (normalizedCasNo starts with "NAME_ONLY:")
      const poisonsNameEntries = await prisma.bannedRestrictedChemical.findMany({
        where: {
          snapshotId: latestCompleteSnapshotId,
          normalizedCasNo: { startsWith: "NAME_ONLY:" },
          source: { linkType: "POISONS_STANDARD" },
        },
        include: {
          source: { select: { sourceName: true, sourceUrl: true, linkType: true } },
        },
      });

      // Match by normalized name comparison
      const nameMatches = poisonsNameEntries.filter((entry) => {
        if (!entry.chemicalName) return false;
        const entryNorm = normalizeName(entry.chemicalName);
        // Exact match or one contains the other
        return (
          entryNorm === normalizedIngName ||
          entryNorm.includes(normalizedIngName) ||
          normalizedIngName.includes(entryNorm)
        );
      });

      if (nameMatches.length > 0) {
        return {
          status: "FOUND_BY_NAME",
          reason: `Ingredient "${ingredientName}" matched ${nameMatches.length} Poisons Standard scheduled substance(s) by name. CAS-level confirmation recommended.`,
          evidenceLinks: [
            ...nameMatches.map((c) => ({
              label: `Poisons Standard: ${c.chemicalName ?? "unknown"}`,
              url: c.evidenceUrl,
            })),
            {
              label: "View record",
              url: `/banned-restricted/records/${latestCompleteSnapshotId}`,
            },
          ],
          matchedSources: nameMatches.map((c) => ({
            sourceName: c.source.sourceName,
            sourceUrl: c.source.sourceUrl,
            matchText: c.matchText,
          })),
          matchMethod: "NAME",
        };
      }
    }
  }

  // ── Missing / invalid CAS with complete snapshot → NEEDS_REVIEW ──
  if (!casValid) {
    const reason = !hasCas
      ? "Missing CAS number — cannot verify against banned/restricted sources by CAS."
      : `Invalid CAS format: "${casNo}". Expected format: digits-digits-digit (e.g. 50-00-0).`;

    return {
      status: "NEEDS_REVIEW",
      reason,
      evidenceLinks: [
        { label: "AICIS Hub Page", url: HUB_URL },
        {
          label: "View snapshot",
          url: `/banned-restricted/records/${latestCompleteSnapshotId}`,
        },
      ],
      matchMethod: "NONE",
    };
  }

  // ── NOT_LISTED — CAS valid but not found in any indexed source ──
  const successSources = await prisma.bannedRestrictedSource.findMany({
    where: {
      snapshotId: latestCompleteSnapshotId,
      fetchStatus: "SUCCESS",
      linkType: { not: "HUB" },
    },
    select: { sourceName: true, sourceUrl: true },
  });

  return {
    status: "NOT_LISTED",
    reason: `CAS ${normalized} not found in ${successSources.length} checked evidence source(s). No evidence found in indexed sources; not a safety confirmation.`,
    evidenceLinks: [
      { label: "AICIS Hub Page", url: snapshot.sourceUrl },
      ...successSources.map((s) => ({ label: s.sourceName, url: s.sourceUrl })),
      {
        label: "View record",
        url: `/banned-restricted/records/${latestCompleteSnapshotId}`,
      },
    ],
    matchMethod: "CAS",
  };
}

/**
 * Evaluate all rows in an upload against the latest COMPLETE banned/restricted snapshot.
 */
export async function evaluateUpload(uploadId: string): Promise<{
  snapshotId: string | null;
  snapshotFetchedAt: string | null;
  isComplete: boolean;
  rows: import("./bannedRestricted.types.js").BannedRestrictedRowResult[];
}> {
  const upload = await prisma.formulationUpload.findUnique({
    where: { id: uploadId },
    include: {
      rows: {
        select: {
          id: true,
          rawName: true,
          casNumber: true,
          matchedIngredient: {
            select: { inciName: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!upload) throw new Error("UPLOAD_NOT_FOUND");

  // Use only the latest COMPLETE snapshot
  const latestComplete = await prisma.bannedRestrictedSnapshot.findFirst({
    where: { isComplete: true },
    orderBy: { fetchedAt: "desc" },
    select: { id: true, fetchedAt: true },
  });

  const snapshotId = latestComplete?.id ?? null;
  const snapshotFetchedAt = latestComplete?.fetchedAt.toISOString() ?? null;

  const rows: import("./bannedRestricted.types.js").BannedRestrictedRowResult[] = [];
  for (const row of upload.rows) {
    // Use matched ingredient name or raw name for name-based matching
    const ingredientName = row.matchedIngredient?.inciName ?? row.rawName;
    const outcome = await evaluateIngredient(row.casNumber, ingredientName, snapshotId);
    rows.push({
      uploadRowId: row.id,
      rawName: row.rawName,
      casNumber: row.casNumber,
      outcome,
    });
  }

  return { snapshotId, snapshotFetchedAt, isComplete: latestComplete !== null, rows };
}
