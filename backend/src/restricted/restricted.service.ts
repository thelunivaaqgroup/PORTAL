import { createHash } from "node:crypto";
import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import type { RestrictedChemicalStatus } from "@prisma/client";

// ── CAS normalization (reuse same logic) ──

function normalizeCas(raw: string): string {
  return raw
    .trim()
    .replace(/\s/g, "")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, "-");
}

// ── Types ──

export type EvidenceSourceSummary = {
  id: string;
  name: string;
  versionLabel: string;
  effectiveDate: string | null;
  status: string;
  hashSha256: string | null;
  chemicalsCount: number;
  notes: string | null;
  createdAt: string;
};

export type RestrictedCheckResult = {
  casNo: string;
  normalizedCasNo: string;
  chemicalName: string | null;
  status: RestrictedChemicalStatus;
  reason: string | null;
  sourceLineRef: string | null;
  evidenceUrl: string | null;
  sourceName: string;
  sourceVersion: string;
};

export type RestrictedCheckResponse = {
  sourceId: string;
  sourceName: string;
  sourceVersion: string;
  checkedAt: string;
  results: RestrictedCheckResult[];
  notFound: string[];
};

// ── Service functions ──

/**
 * Get the currently ACTIVE evidence source (the dataset used for compliance checks).
 */
export async function getActiveDataset(): Promise<EvidenceSourceSummary | null> {
  const source = await prisma.evidenceSource.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { chemicals: true } },
    },
  });

  if (!source) return null;

  return {
    id: source.id,
    name: source.name,
    versionLabel: source.versionLabel,
    effectiveDate: source.effectiveDate?.toISOString() ?? null,
    status: source.status,
    hashSha256: source.hashSha256,
    chemicalsCount: source._count.chemicals,
    notes: source.notes,
    createdAt: source.createdAt.toISOString(),
  };
}

/**
 * List all evidence sources (for admin management).
 */
export async function listDatasets(): Promise<EvidenceSourceSummary[]> {
  const sources = await prisma.evidenceSource.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { chemicals: true } },
    },
  });

  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    versionLabel: s.versionLabel,
    effectiveDate: s.effectiveDate?.toISOString() ?? null,
    status: s.status,
    hashSha256: s.hashSha256,
    chemicalsCount: s._count.chemicals,
    notes: s.notes,
    createdAt: s.createdAt.toISOString(),
  }));
}

/**
 * Ingest a restricted chemical index from a CSV string.
 *
 * Expected CSV format:
 *   casNo,chemicalName,status,reason,sourceLineRef,evidenceUrl
 *
 * manifest fields:
 *   name, versionLabel, effectiveDate (optional), notes (optional)
 */
export async function ingestDataset(
  userId: string,
  manifest: {
    name: string;
    versionLabel: string;
    effectiveDate?: string;
    notes?: string;
  },
  csvContent: string,
): Promise<EvidenceSourceSummary> {
  const hash = createHash("sha256").update(csvContent, "utf8").digest("hex");

  // Parse CSV
  const lines = csvContent
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    throw new Error("CSV must have a header row and at least one data row.");
  }

  const header = lines[0].toLowerCase();
  if (!header.includes("casno") && !header.includes("cas_no") && !header.includes("cas no")) {
    throw new Error("CSV header must contain a 'casNo' column.");
  }

  // Parse header to find column indices
  const headerCols = parseCSVLine(lines[0]).map((c) =>
    c.toLowerCase().replace(/[^a-z0-9]/g, ""),
  );
  const casIdx = headerCols.findIndex((c) => c === "casno" || c === "cas_no" || c === "casnumber");
  const nameIdx = headerCols.findIndex((c) => c === "chemicalname" || c === "name");
  const statusIdx = headerCols.findIndex((c) => c === "status");
  const reasonIdx = headerCols.findIndex((c) => c === "reason");
  const lineRefIdx = headerCols.findIndex((c) => c === "sourcelineref" || c === "lineref");
  const evidenceIdx = headerCols.findIndex((c) => c === "evidenceurl" || c === "evidence");

  if (casIdx === -1) {
    throw new Error("CSV must have a 'casNo' column.");
  }

  // Parse data rows
  type RowData = {
    casNo: string;
    chemicalName: string | null;
    status: RestrictedChemicalStatus;
    reason: string | null;
    sourceLineRef: string | null;
    evidenceUrl: string | null;
  };

  const rows: RowData[] = [];
  const validStatuses = new Set(["BANNED", "RESTRICTED", "LISTED", "NOT_LISTED", "UNKNOWN"]);

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const rawCas = cols[casIdx]?.trim();
    if (!rawCas) continue;

    const normalizedCas = normalizeCas(rawCas);
    const rawStatus = statusIdx >= 0 ? cols[statusIdx]?.trim().toUpperCase() : "LISTED";
    const status: RestrictedChemicalStatus = validStatuses.has(rawStatus)
      ? (rawStatus as RestrictedChemicalStatus)
      : "UNKNOWN";

    rows.push({
      casNo: normalizedCas,
      chemicalName: nameIdx >= 0 ? cols[nameIdx]?.trim() || null : null,
      status,
      reason: reasonIdx >= 0 ? cols[reasonIdx]?.trim() || null : null,
      sourceLineRef: lineRefIdx >= 0 ? cols[lineRefIdx]?.trim() || null : null,
      evidenceUrl: evidenceIdx >= 0 ? cols[evidenceIdx]?.trim() || null : null,
    });
  }

  if (rows.length === 0) {
    throw new Error("CSV contained no valid data rows.");
  }

  // Transactionally create the dataset
  const result = await prisma.$transaction(async (tx) => {
    // Archive any existing ACTIVE sources
    await tx.evidenceSource.updateMany({
      where: { status: "ACTIVE" },
      data: { status: "ARCHIVED" },
    });

    // Create new source
    const source = await tx.evidenceSource.create({
      data: {
        name: manifest.name,
        versionLabel: manifest.versionLabel,
        effectiveDate: manifest.effectiveDate ? new Date(manifest.effectiveDate) : null,
        hashSha256: hash,
        status: "ACTIVE",
        notes: manifest.notes ?? `Imported ${rows.length} chemicals`,
        createdByUserId: userId,
      },
    });

    // Bulk insert chemicals (use createMany for speed)
    await tx.restrictedChemicalIndex.createMany({
      data: rows.map((r) => ({
        sourceId: source.id,
        casNo: r.casNo,
        chemicalName: r.chemicalName,
        status: r.status,
        reason: r.reason,
        sourceLineRef: r.sourceLineRef,
        evidenceUrl: r.evidenceUrl,
      })),
      skipDuplicates: true,
    });

    return source;
  });

  logger.info({
    event: "RESTRICTED_DATASET_INGESTED",
    sourceId: result.id,
    name: manifest.name,
    versionLabel: manifest.versionLabel,
    chemicalsCount: rows.length,
  });

  return {
    id: result.id,
    name: result.name,
    versionLabel: result.versionLabel,
    effectiveDate: result.effectiveDate?.toISOString() ?? null,
    status: result.status,
    hashSha256: result.hashSha256,
    chemicalsCount: rows.length,
    notes: result.notes,
    createdAt: result.createdAt.toISOString(),
  };
}

/**
 * Check an array of CAS numbers against the active restricted chemical index.
 */
export async function checkCasNumbers(
  casNumbers: string[],
): Promise<RestrictedCheckResponse> {
  const activeSource = await prisma.evidenceSource.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, versionLabel: true },
  });

  if (!activeSource) {
    throw new Error("NO_ACTIVE_DATASET");
  }

  const results: RestrictedCheckResult[] = [];
  const notFound: string[] = [];

  for (const rawCas of casNumbers) {
    const normalized = normalizeCas(rawCas);
    if (!normalized) {
      notFound.push(rawCas);
      continue;
    }

    const chemical = await prisma.restrictedChemicalIndex.findFirst({
      where: {
        sourceId: activeSource.id,
        casNo: normalized,
      },
    });

    if (chemical) {
      results.push({
        casNo: rawCas,
        normalizedCasNo: normalized,
        chemicalName: chemical.chemicalName,
        status: chemical.status,
        reason: chemical.reason,
        sourceLineRef: chemical.sourceLineRef,
        evidenceUrl: chemical.evidenceUrl,
        sourceName: activeSource.name,
        sourceVersion: activeSource.versionLabel,
      });
    } else {
      notFound.push(rawCas);
    }
  }

  return {
    sourceId: activeSource.id,
    sourceName: activeSource.name,
    sourceVersion: activeSource.versionLabel,
    checkedAt: new Date().toISOString(),
    results,
    notFound,
  };
}

/**
 * Archive a dataset by ID.
 */
export async function archiveDataset(sourceId: string): Promise<void> {
  await prisma.evidenceSource.update({
    where: { id: sourceId },
    data: { status: "ARCHIVED" },
  });
}

// ── CSV parsing helper (handles quoted fields) ──

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}
