import { readFile } from "node:fs/promises";
import { parse as csvParse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import type { ParsedFileContent, ParserMeta } from "./extraction.types.js";

// ── Keyword lists for header detection ──

const INGREDIENT_KEYWORDS = ["ingredient", "raw material", "material", "inci", "name"];
const PERCENT_KEYWORDS = ["%", "percent", "percentage", "w/w", "concentration", "conc"];
const CAS_KEYWORDS = ["cas", "cas number"];

const MAX_SCAN_ROWS = 300;
const EMPTY_STREAK_LIMIT = 3;

// ── Public entry point ──

export async function parseFile(filePath: string, mimeType: string): Promise<ParsedFileContent> {
  const buffer = await readFile(filePath);

  // CSV
  if (mimeType === "text/csv" || filePath.endsWith(".csv")) {
    return parseCsv(buffer);
  }

  // XLSX / XLS
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    filePath.endsWith(".xlsx") ||
    filePath.endsWith(".xls")
  ) {
    return parseXlsx(buffer);
  }

  // PDF
  if (mimeType === "application/pdf" || filePath.endsWith(".pdf")) {
    return parsePdf(buffer);
  }

  // Images
  if (mimeType.startsWith("image/")) {
    return parseImage(buffer);
  }

  return {
    format: "csv",
    rawText: "",
    rowCount: 0,
    parserMeta: {
      fileType: mimeType,
      extractedRowCountBeforeAI: 0,
    },
  };
}

// ── CSV ──

function parseCsv(buffer: Buffer): ParsedFileContent {
  const records: string[][] = csvParse(buffer, {
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  });
  const rawText = records.map((row) => row.join(" | ")).join("\n");
  return {
    format: "csv",
    rawText,
    rowCount: records.length,
    parserMeta: {
      fileType: "csv",
      extractedRowCountBeforeAI: records.length,
    },
  };
}

// ── XLSX — smart header detection ──

function parseXlsx(buffer: Buffer): ParsedFileContent {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetNames = workbook.SheetNames;

  if (sheetNames.length === 0) {
    return {
      format: "xlsx",
      rawText: "",
      rowCount: 0,
      parserMeta: {
        fileType: "xlsx",
        sheets: [],
        rowsScanned: 0,
        headerRowIndex: null,
        ingredientColIndex: null,
        percentColIndex: null,
        extractedRowCountBeforeAI: 0,
      },
    };
  }

  // Try each sheet and pick the first one that yields a valid table
  let bestResult: {
    rawText: string;
    rowCount: number;
    meta: ParserMeta;
    structuredRows: { name: string; pct: number | null; cas?: string }[];
  } | null = null;

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName]!;
    const allRows: string[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      blankrows: true,
    });

    const scanLimit = Math.min(allRows.length, MAX_SCAN_ROWS);

    // 1. Find header row
    const headerResult = detectHeaderRow(allRows, scanLimit);

    if (!headerResult) continue; // try next sheet

    const { headerRowIdx, ingredientCol, percentCol, casCol } = headerResult;

    // 2. Extract data rows after header
    const dataRows: { name: string; pct: number | null; cas?: string }[] = [];
    let emptyStreak = 0;

    for (let r = headerRowIdx + 1; r < allRows.length; r++) {
      const row = allRows[r];
      const name = String(row[ingredientCol] ?? "").trim();

      if (!name) {
        emptyStreak++;
        if (emptyStreak >= EMPTY_STREAK_LIMIT) break;
        continue;
      }
      emptyStreak = 0;

      const rawPct = percentCol !== null ? (row[percentCol] ?? "") : "";
      const pct = normalizePct(rawPct);

      const cas = casCol !== null ? String(row[casCol] ?? "").trim() || undefined : undefined;

      dataRows.push({ name, pct, cas });
    }

    if (dataRows.length === 0) continue; // try next sheet

    // Build rawText for AI consumption
    const lines = dataRows.map(
      (r) => `${r.name} | ${r.pct !== null ? r.pct : ""}`,
    );
    const rawText = `Ingredient | Concentration %\n${lines.join("\n")}`;

    const meta: ParserMeta = {
      fileType: "xlsx",
      sheets: sheetNames,
      rowsScanned: scanLimit,
      headerRowIndex: headerRowIdx,
      ingredientColIndex: ingredientCol,
      percentColIndex: percentCol,
      casColIndex: casCol,
      extractedRowCountBeforeAI: dataRows.length,
    };

    bestResult = { rawText, rowCount: dataRows.length, meta, structuredRows: dataRows };
    break; // use the first sheet that works
  }

  // Fallback: no structured table found — dump raw text from all sheets
  if (!bestResult) {
    const rawLines: string[] = [];
    let totalRows = 0;
    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName]!;
      const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
      });
      totalRows += rows.length;
      rawLines.push(
        ...rows
          .slice(0, MAX_SCAN_ROWS)
          .map((row) => row.map((c) => String(c).trim()).join(" | ")),
      );
    }

    return {
      format: "xlsx",
      rawText: rawLines.join("\n"),
      rowCount: totalRows,
      parserMeta: {
        fileType: "xlsx",
        sheets: sheetNames,
        rowsScanned: Math.min(totalRows, MAX_SCAN_ROWS * sheetNames.length),
        headerRowIndex: null,
        ingredientColIndex: null,
        percentColIndex: null,
        extractedRowCountBeforeAI: 0,
      },
    };
  }

  return {
    format: "xlsx",
    rawText: bestResult.rawText,
    rowCount: bestResult.rowCount,
    parserMeta: bestResult.meta,
    structuredRows: bestResult.structuredRows,
  };
}

// ── Header detection helpers ──

function detectHeaderRow(
  rows: string[][],
  scanLimit: number,
): { headerRowIdx: number; ingredientCol: number; percentCol: number | null; casCol: number | null } | null {
  for (let r = 0; r < scanLimit; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const cells = row.map((c) => String(c).toLowerCase().trim());

    let ingMatches = 0;
    let pctMatches = 0;
    let bestIngCol = -1;
    let bestIngScore = 0;
    let bestPctCol = -1;
    let bestPctScore = 0;
    let bestCasCol = -1;
    let bestCasScore = 0;

    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      if (!cell) continue;

      const ingScore = keywordScore(cell, INGREDIENT_KEYWORDS);
      const pctScore = keywordScore(cell, PERCENT_KEYWORDS);
      const casScore = keywordScore(cell, CAS_KEYWORDS);

      if (ingScore > 0) {
        ingMatches++;
        if (ingScore > bestIngScore) {
          bestIngScore = ingScore;
          bestIngCol = c;
        }
      }

      if (pctScore > 0) {
        pctMatches++;
        if (pctScore > bestPctScore) {
          bestPctScore = pctScore;
          bestPctCol = c;
        }
      }

      if (casScore > 0) {
        if (casScore > bestCasScore) {
          bestCasScore = casScore;
          bestCasCol = c;
        }
      }
    }

    // Need at least 1 ingredient match AND at least 1 percent match
    if (ingMatches >= 1 && pctMatches >= 1) {
      return {
        headerRowIdx: r,
        ingredientCol: bestIngCol,
        percentCol: bestPctCol >= 0 ? bestPctCol : null,
        casCol: bestCasCol >= 0 ? bestCasCol : null,
      };
    }
  }

  return null;
}

function keywordScore(cell: string, keywords: string[]): number {
  let best = 0;
  for (const kw of keywords) {
    if (cell === kw) {
      best = Math.max(best, 3); // exact match
    } else if (cell.includes(kw)) {
      best = Math.max(best, 2); // substring match
    }
  }
  return best;
}

// ── Percent normalization ──

function normalizePct(raw: string | number): number | null {
  // If already a number, use as-is
  if (typeof raw === "number") {
    return isNaN(raw) ? null : raw;
  }

  if (!raw) return null;

  const lower = raw.toLowerCase().trim();

  // q.s., qs, n/a, trace, etc. → null
  if (/^(q\.?s\.?|n\/?a|trace|-)$/i.test(lower)) return null;

  // Strip trailing %
  const cleaned = lower.replace(/%$/, "").trim();
  if (!cleaned) return null;

  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;

  return num;
}

// ── PDF ──

async function parsePdf(buffer: Buffer): Promise<ParsedFileContent> {
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  return {
    format: "pdf",
    rawText: data.text,
    parserMeta: {
      fileType: "pdf",
      extractedRowCountBeforeAI: 0, // PDF text is unstructured
    },
  };
}

// ── Image ──

function parseImage(buffer: Buffer): ParsedFileContent {
  const base64 = buffer.toString("base64");
  return {
    format: "image",
    rawText: base64,
    parserMeta: {
      fileType: "image",
      extractedRowCountBeforeAI: 0,
    },
  };
}
