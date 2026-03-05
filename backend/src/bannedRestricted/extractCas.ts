/**
 * Strict CAS extractor for banned/restricted HTML pages.
 *
 * Rules:
 * - Strip <script> and <style> tags
 * - Convert closing </tr>, </td>, </th>, </li>, <br> to newlines
 * - Strip remaining HTML tags
 * - Extract CAS via regex: \b\d{2,7}-\d{2}-\d\b
 * - Capture full line as matchText
 * - Capture chemicalName only if confidently before CAS on the same line
 * - De-duplicate by normalized CAS
 * - Do NOT infer, fabricate, or classify
 */

/** CAS Registry Number: 2-7 digits, dash, 2 digits, dash, 1 check digit */
const CAS_PATTERN = /\b(\d{2,7}-\d{2}-\d)\b/g;

export type CasHit = {
  normalizedCasNo: string;
  chemicalName: string | null;
  matchText: string;
};

/** Normalize CAS: trim, remove whitespace, normalize unicode hyphens to ASCII hyphen. */
function normalizeCas(raw: string): string {
  return raw
    .trim()
    .replace(/\s/g, "")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, "-");
}

/**
 * Extract CAS numbers from plain text (e.g. PDF-extracted text).
 * Same logic as extractCasFromHtml but skips HTML stripping.
 */
export function extractCasFromText(text: string): CasHit[] {
  const lines = text.split("\n");
  const seen = new Set<string>();
  const hits: CasHit[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;

    CAS_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = CAS_PATTERN.exec(line)) !== null) {
      const cas = normalizeCas(match[1]);
      if (seen.has(cas)) continue;
      seen.add(cas);

      const matchText = line.length > 500 ? line.slice(0, 500) : line;
      const chemicalName = extractChemicalNameFromText(line, match.index);

      hits.push({ normalizedCasNo: cas, chemicalName, matchText });
    }
  }

  return hits;
}

/**
 * Try to extract chemical name from plain text preceding the CAS position.
 * Simpler heuristic than HTML version — just takes text before CAS on same line.
 */
function extractChemicalNameFromText(line: string, casIndex: number): string | null {
  const before = line.slice(0, casIndex).trim();
  if (!before) return null;

  // Split by common delimiters in PDF-extracted text
  const segments = before.split(/[\t|–—]/).map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;

  for (let i = segments.length - 1; i >= 0; i--) {
    const candidate = segments[i];
    if (!/[a-zA-Z]/.test(candidate)) continue;
    if (candidate.length < 2 || candidate.length > 300) continue;
    if (/^\d+[\s.,-]*$/.test(candidate)) continue;
    const name = candidate.replace(/[,;:\s]+$/, "").trim();
    if (name.length < 2) continue;
    return name;
  }

  return null;
}

/**
 * Extract CAS numbers from raw HTML.
 * Returns de-duplicated hits with matchText context and optional chemicalName.
 */
export function extractCasFromHtml(html: string): CasHit[] {
  // 1. Strip <script> and <style> blocks (case-insensitive, dotall)
  let cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, "");

  // 2. Convert table/list boundaries to newlines for line-level context
  cleaned = cleaned.replace(/<\/tr>/gi, "\n");
  cleaned = cleaned.replace(/<\/td>/gi, "\t");
  cleaned = cleaned.replace(/<\/th>/gi, "\t");
  cleaned = cleaned.replace(/<\/li>/gi, "\n");
  cleaned = cleaned.replace(/<br\s*\/?>/gi, "\n");

  // 3. Strip all remaining HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, " ");

  // 4. Decode common HTML entities
  cleaned = cleaned.replace(/&amp;/g, "&");
  cleaned = cleaned.replace(/&lt;/g, "<");
  cleaned = cleaned.replace(/&gt;/g, ">");
  cleaned = cleaned.replace(/&nbsp;/g, " ");
  cleaned = cleaned.replace(/&#\d+;/g, " ");

  // 5. Split into lines and search each
  const lines = cleaned.split("\n");
  const seen = new Set<string>();
  const hits: CasHit[] = [];

  for (const rawLine of lines) {
    // Collapse whitespace within line
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;

    CAS_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = CAS_PATTERN.exec(line)) !== null) {
      const cas = normalizeCas(match[1]);
      if (seen.has(cas)) continue;
      seen.add(cas);

      // Truncate matchText to 500 chars
      const matchText = line.length > 500 ? line.slice(0, 500) : line;

      // Attempt to extract chemical name: text before the CAS on the same line.
      // Only if the CAS appears after some alphabetic text separated by whitespace/tab.
      const chemicalName = extractChemicalName(line, match.index);

      hits.push({
        normalizedCasNo: cas,
        chemicalName,
        matchText,
      });
    }
  }

  return hits;
}

/**
 * Try to extract a chemical name from text preceding the CAS position.
 * Returns null if no confident name can be extracted.
 *
 * Heuristics:
 * - Take text before the CAS match position
 * - Split by tab (table column boundary)
 * - Take the last non-empty segment before the CAS column
 * - Must contain at least one letter
 * - Must be between 2 and 300 chars
 * - Must not be just numbers or punctuation
 */
function extractChemicalName(line: string, casIndex: number): string | null {
  const before = line.slice(0, casIndex).trim();
  if (!before) return null;

  // Split by tab boundaries (from </td> conversion)
  const segments = before.split("\t").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;

  // Walk backwards from the CAS to find the nearest name-like segment
  // The segment immediately before CAS is most likely the chemical name
  for (let i = segments.length - 1; i >= 0; i--) {
    const candidate = segments[i];

    // Must contain at least one letter
    if (!/[a-zA-Z]/.test(candidate)) continue;

    // Must be reasonable length
    if (candidate.length < 2 || candidate.length > 300) continue;

    // Must not be just a number with units or a date pattern
    if (/^\d+[\s.,-]*$/.test(candidate)) continue;

    // Trim trailing punctuation
    const name = candidate.replace(/[,;:\s]+$/, "").trim();
    if (name.length < 2) continue;

    return name;
  }

  return null;
}
