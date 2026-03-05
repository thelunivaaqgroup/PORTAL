export type ModeHint = "REPLACE" | "APPEND";

export interface ExtractedRow {
  rawName: string;
  suggestedInciName?: string;
  casNumber?: string;
  concentrationPct?: number;
  confidence: number;
  issues: string[];
}

export interface ParsedFileContent {
  format: "csv" | "xlsx" | "pdf" | "image";
  rawText: string;
  rowCount?: number;
  /** Debug metadata produced by the parser */
  parserMeta?: ParserMeta;
  /** Structured rows extracted by the parser (XLSX smart parse) — used as fallback when AI disabled */
  structuredRows?: { name: string; pct: number | null; cas?: string }[];
}

export interface ParserMeta {
  fileType: string;
  sheets?: string[];
  rowsScanned?: number;
  headerRowIndex?: number | null;
  ingredientColIndex?: number | null;
  percentColIndex?: number | null;
  casColIndex?: number | null;
  extractedRowCountBeforeAI: number;
}

export type ReasonCode =
  | "OK"
  | "STRUCTURED_OK"
  | "AI_FALLBACK_USED"
  | "EXTRACTION_FAILED"
  | "XLSX_NO_TABLE"
  | "PARSER_EMPTY"
  | "AI_RETURNED_EMPTY"
  | "AI_DISABLED"
  | "UNSUPPORTED_FILE";

export type ExtractionMode = "STRUCTURED" | "AI" | "NONE";

export interface ParserSummary extends ParserMeta {}

export interface AiSummary {
  enabled: boolean;
  inputChars: number;
  outputRows: number;
}

export interface UploadBody {
  modeHint?: ModeHint;
}

export interface ApplyBody {
  mode: ModeHint;
}
