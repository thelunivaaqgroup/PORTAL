import { createHash } from "node:crypto";
import XLSX from "xlsx";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import type { ImportSnapshotInput, SnapshotSummary } from "./aicis.types.js";

// ── Normalization helpers ──

function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeCas(cas: string | null | undefined): string | null {
  if (!cas) return null;
  const cleaned = cas.trim().replace(/\s/g, "");
  // Only keep if it looks like a valid CAS
  return cleaned || null;
}

/** CAS Registry Number pattern: 2-7 digits, dash, 2 digits, dash, 1 digit */
const CAS_PATTERN = /^\d{2,7}-\d{2}-\d$/;

/**
 * Parse a cell value that may contain one or more CAS numbers.
 * Splits on comma, semicolon, newline. Validates each token.
 * Returns array of valid CAS tokens (may be empty).
 */
function parseCasTokens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  // Split on common delimiters
  const tokens = raw.split(/[,;\n\r]+/).map((t) => t.trim()).filter(Boolean);
  const valid: string[] = [];
  for (const token of tokens) {
    // Remove non-CAS characters but keep digits and hyphens
    const cleaned = token.replace(/\s/g, "");
    if (CAS_PATTERN.test(cleaned)) {
      valid.push(cleaned);
    }
  }
  return valid;
}

function computeSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Read a cell's text value from a sheet, preferring the formatted text (cell.w)
 * over the raw value (cell.v). This is critical for CAS numbers which Excel
 * may interpret as dates/numbers internally.
 */
function readCellText(
  sheet: XLSX.WorkSheet,
  row: number,
  col: number,
): string {
  const addr = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[addr];
  if (!cell) return "";
  // cell.w = formatted text (what the user sees in Excel)
  // cell.v = raw value (could be a date serial number for CAS-like text)
  if (typeof cell.w === "string" && cell.w.trim()) {
    return cell.w.trim();
  }
  // Fallback: convert raw value to string
  return String(cell.v ?? "").trim();
}

/**
 * Import AICIS Inventory from an uploaded XLSX buffer.
 * - Computes SHA256 for deduplication
 * - If same regionCode+fileSha256 exists, returns existing snapshot
 * - Parses Excel with proper CAS handling (cell.w for formatted text)
 * - Splits multi-CAS cells and validates each token
 * - Sets new snapshot as active, deactivates others for same regionCode
 */
export async function importAicisInventoryFromBuffer(
  opts: ImportSnapshotInput,
): Promise<SnapshotSummary> {
  const { regionCode, fileBuffer, originalFilename, actorUserId, notes } = opts;

  // ── 1. SHA256 for deduplication ──
  const fileSha256 = computeSha256(fileBuffer);

  // ── 2. Check for duplicate (same region + sha256) ──
  const existing = await prisma.aicisInventorySnapshot.findUnique({
    where: { regionCode_fileSha256: { regionCode, fileSha256 } },
  });
  if (existing) {
    return {
      snapshotId: existing.id,
      versionName: existing.versionName,
      regionCode: existing.regionCode,
      rowCount: existing.rowCount,
      isActive: existing.isActive,
      importedAt: existing.importedAt,
      sourceFilename: existing.sourceFileName,
      fileSha256: existing.fileSha256,
    };
  }

  // ── 3. Derive versionName ──
  const defaultVersionName = originalFilename.replace(/\.xlsx$/i, "");
  const versionName =
    opts.versionName && opts.versionName.trim()
      ? opts.versionName.trim()
      : defaultVersionName;

  // ── 4. Parse XLSX from buffer ──
  // cellDates:false prevents date-parsing of CAS-like values
  const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("EMPTY_WORKBOOK");
  }

  const sheet = workbook.Sheets[sheetName];

  // Use sheet_to_json for general row iteration (gives us row count/structure)
  const allRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (allRows.length < 3) {
    throw new Error("INSUFFICIENT_ROWS");
  }

  // Row 0 = disclaimer (skip), Row 1 = headers
  const headerRow = allRows[1] as string[];

  // ── 5. Detect columns by header text ──
  const colMap: Record<string, number> = {};
  const headerMappings: [string, string[]][] = [
    ["crNo", ["cr no", "cr no."]],
    ["casNo", ["cas no", "cas no."]],
    ["chemicalName", ["chemical name"]],
    ["approvedName", ["aicis approved chemical name", "approved chemical name"]],
    ["molecularFormula", ["molecular formula"]],
    ["specificInfoRequirements", ["specific information requirements"]],
    ["definedScope", ["defined scope of assessment or listing", "defined scope"]],
    ["conditionsOfUse", ["conditions of introduction and use", "conditions of use"]],
    ["prescribedInfo", ["prescribed information"]],
  ];

  for (let i = 0; i < headerRow.length; i++) {
    const h = String(headerRow[i] ?? "").trim().toLowerCase();
    for (const [key, patterns] of headerMappings) {
      if (patterns.some((p) => h.includes(p)) && !(key in colMap)) {
        colMap[key] = i;
      }
    }
  }

  if (!("crNo" in colMap) || !("approvedName" in colMap)) {
    throw new Error(
      `MISSING_REQUIRED_COLUMNS: Found columns: ${Object.keys(colMap).join(", ")}. ` +
      `Headers: ${headerRow.slice(0, 10).join(", ")}`,
    );
  }

  // ── 6. Parse data rows (starting from row index 2) ──
  // For CAS column, read directly from sheet cells using cell.w (formatted text)
  const hasCasCol = colMap.casNo !== undefined;
  const casColIdx = colMap.casNo;

  const chemicals: {
    crNo: string;
    casNo: string | null;
    chemicalName: string | null;
    approvedName: string;
    molecularFormula: string | null;
    specificInfoRequirements: string | null;
    definedScope: string | null;
    conditionsOfUse: string | null;
    prescribedInfo: string | null;
    normalizedApprovedName: string;
    normalizedCasNo: string | null;
    additionalJson: Prisma.InputJsonValue | null;
  }[] = [];

  for (let i = 2; i < allRows.length; i++) {
    const row = allRows[i] as string[];
    const crNo = String(row[colMap.crNo] ?? "").trim();
    const approvedNameRaw = String(row[colMap.approvedName] ?? "").trim();
    const chemicalNameRaw = colMap.chemicalName !== undefined ? String(row[colMap.chemicalName] ?? "").trim() : "";

    // Use approvedName if present, otherwise fall back to chemicalName
    const effectiveName = approvedNameRaw || chemicalNameRaw;

    if (!crNo || !effectiveName) continue;

    // ── CAS: read cell.w (formatted text) to avoid date/number corruption ──
    let casRawText: string | null = null;
    if (hasCasCol) {
      // i is the 0-based index in allRows, which maps to sheet row i
      // allRows[0] = sheet row 0, allRows[1] = sheet row 1, etc.
      casRawText = readCellText(sheet, i, casColIdx) || null;
    }

    // Parse multi-CAS tokens
    const casTokens = parseCasTokens(casRawText);
    const primaryCas = casTokens.length > 0 ? casTokens[0] : null;
    const normalizedPrimaryCas = normalizeCas(primaryCas);

    const molecularFormula = colMap.molecularFormula !== undefined ? String(row[colMap.molecularFormula] ?? "").trim() || null : null;
    const specificInfoRequirements = colMap.specificInfoRequirements !== undefined ? String(row[colMap.specificInfoRequirements] ?? "").trim() || null : null;
    const definedScope = colMap.definedScope !== undefined ? String(row[colMap.definedScope] ?? "").trim() || null : null;
    const conditionsOfUse = colMap.conditionsOfUse !== undefined ? String(row[colMap.conditionsOfUse] ?? "").trim() || null : null;
    const prescribedInfo = colMap.prescribedInfo !== undefined ? String(row[colMap.prescribedInfo] ?? "").trim() || null : null;

    chemicals.push({
      crNo,
      casNo: primaryCas,
      chemicalName: chemicalNameRaw || null,
      approvedName: effectiveName,
      molecularFormula,
      specificInfoRequirements,
      definedScope,
      conditionsOfUse,
      prescribedInfo,
      normalizedApprovedName: normalizeName(effectiveName),
      normalizedCasNo: normalizedPrimaryCas,
      additionalJson:
        casTokens.length > 1
          ? { casNumbers: casTokens }
          : casTokens.length === 1
            ? { casNumbers: casTokens }
            : null,
    });
  }

  logger.info({
    event: "aicis_import_parsed",
    versionName,
    chemicalCount: chemicals.length,
    sampleCas: chemicals.slice(0, 5).map((c) => ({
      crNo: c.crNo,
      casNo: c.casNo,
      normalizedCasNo: c.normalizedCasNo,
    })),
  });

  // ── 7. Transaction: create snapshot + chemicals + set active ──
  const CHUNK_SIZE = 1000;
  const snapshot = await prisma.$transaction(async (tx) => {
    // Deactivate all other snapshots for this region
    await tx.aicisInventorySnapshot.updateMany({
      where: { regionCode, isActive: true },
      data: { isActive: false },
    });

    // Create new snapshot as active
    const snap = await tx.aicisInventorySnapshot.create({
      data: {
        versionName,
        regionCode,
        asOfDate: new Date(),
        sourceFileName: originalFilename,
        fileSha256,
        rowCount: chemicals.length,
        isActive: true,
        notes: notes ?? null,
        importedByUserId: actorUserId,
      },
    });

    // Bulk insert chemicals in chunks
    for (let i = 0; i < chemicals.length; i += CHUNK_SIZE) {
      const chunk = chemicals.slice(i, i + CHUNK_SIZE);
      await tx.aicisInventoryChemical.createMany({
        data: chunk.map((c) => ({
          ...c,
          snapshotId: snap.id,
          additionalJson: c.additionalJson ?? Prisma.JsonNull,
        })),
        skipDuplicates: true,
      });
    }

    return snap;
  }, { timeout: 120000 });

  logger.info({
    event: "aicis_import_complete",
    snapshotId: snapshot.id,
    versionName,
    regionCode,
    chemicalCount: chemicals.length,
    fileSha256,
  });

  return {
    snapshotId: snapshot.id,
    versionName,
    regionCode,
    rowCount: chemicals.length,
    isActive: true,
    importedAt: snapshot.importedAt,
    sourceFilename: originalFilename,
    fileSha256,
  };
}
