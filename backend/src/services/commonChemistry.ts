/**
 * commonChemistry.ts
 *
 * CAS validation + Common Chemistry lookup for official chemical names.
 *
 * Lookup strategy:
 *   1. Fetch the CC detail HTML page and parse with cheerio for <h1>.
 *   2. If <h1> is empty (SPA shell), fall back to the CC detail JSON API.
 *   3. NOT_FOUND only from HTTP 404 — never from a parsing failure.
 *   4. All other errors (401/403/429/5xx/timeout) → NEEDS_REVIEW.
 *
 * Enterprise rules:
 *   1. CAS validity = checksum validation ONLY (local, no network).
 *   2. INVALID_CAS only from checksum failure — never from network issues.
 *   3. Results cached in DB for 30 days (configurable via CAS_CACHE_TTL_DAYS).
 */

import { prisma } from "../prisma.js";
import { writeAuditLog } from "../audit/audit.service.js";
import * as cheerio from "cheerio";

const CC_DETAIL_PAGE = "https://commonchemistry.cas.org/detail";
const CC_API_BASE = "https://rboq1qukh0.execute-api.us-east-2.amazonaws.com/default";
const CC_API_KEY = "4vrOF3YIRf5vFkzLsed1i2OBH7BLUusf6NMu2UCD";
const CACHE_TTL_DAYS = Number(process.env.CAS_CACHE_TTL_DAYS ?? "30");
const FETCH_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 1;

// ── Types ──

export type CasValidity = "VALID" | "INVALID" | "MISSING";

export type CommonChemistryStatus = "FOUND" | "NOT_FOUND" | "NEEDS_REVIEW";

export type CasDetailResult = {
  normalizedCas: string;
  casValidity: CasValidity;
  commonChemistryStatus: CommonChemistryStatus;
  commonChemistryName: string | null;
  commonChemistryUrl: string;
  commonChemistryReason: string;
  httpStatus: number | null;
};

// ── CAS normalization ──

export function normalizeCas(input: string): string {
  let s = input.trim();
  s = s.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-");
  s = s.replace(/[^\d-]/g, "");
  s = s.replace(/-{2,}/g, "-");
  s = s.replace(/^-+|-+$/g, "");

  if (/^\d{2,7}-\d{2}-\d$/.test(s)) return s;

  const digits = s.replace(/-/g, "");
  if (/^\d{5,10}$/.test(digits)) {
    return `${digits.slice(0, -3)}-${digits.slice(-3, -1)}-${digits.slice(-1)}`;
  }

  return s;
}

// ── CAS checksum (mod-10) — ONLY source of INVALID ──

export function isValidCasChecksum(cas: string): boolean {
  const n = normalizeCas(cas);
  const m = n.match(/^(\d{2,7})-(\d{2})-(\d)$/);
  if (!m) return false;

  const allDigits = m[1] + m[2];
  const check = Number(m[3]);
  let sum = 0;
  for (let i = 0; i < allDigits.length; i++) {
    sum += Number(allDigits[allDigits.length - 1 - i]) * (i + 1);
  }
  return sum % 10 === check;
}

// ── HTML name extraction (exported for testing) ──

/**
 * Extract the official chemical name from the CC detail page HTML.
 * Looks for the first <h1> element with text content.
 */
export function extractNameFromHtml(html: string): string | null {
  const $ = cheerio.load(html);
  const h1Text = $("h1").first().text().trim();
  return h1Text.length > 0 ? h1Text : null;
}

// ── Step 1: Fetch HTML detail page ──

async function fetchDetailHtml(
  casNo: string,
): Promise<
  | { html: string; httpStatus: number }
  | { httpStatus: 404 }
  | { error: string; httpStatus: number | null }
> {
  const url = `${CC_DETAIL_PAGE}?cas_rn=${encodeURIComponent(casNo)}&search=${encodeURIComponent(casNo)}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    console.log("CAS_DETAIL_STATUS", casNo, res.status);

    if (res.status === 404) {
      return { httpStatus: 404 };
    }

    if (res.status >= 400) {
      const body = await res.text().catch(() => "");
      return { error: `HTTP ${res.status}: ${body.slice(0, 200)}`, httpStatus: res.status };
    }

    const html = await res.text();
    return { html, httpStatus: res.status };
  } catch (err) {
    return { error: String(err).slice(0, 300), httpStatus: null };
  }
}

// ── Step 2: Fallback to JSON API detail endpoint ──

async function fetchDetailApi(
  casNo: string,
  retries: number,
): Promise<
  | { name: string; httpStatus: number }
  | { httpStatus: 404 }
  | { error: string; httpStatus: number | null }
> {
  const url = `${CC_API_BASE}/detail?cas_rn=${encodeURIComponent(casNo)}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "X-API-KEY": CC_API_KEY,
          Accept: "application/json",
          Origin: "https://commonchemistry.cas.org",
          Referer: `${CC_DETAIL_PAGE}?cas_rn=${encodeURIComponent(casNo)}&search=${encodeURIComponent(casNo)}`,
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      console.log("CAS_DETAIL_API_STATUS", casNo, res.status);

      if (res.status === 404) {
        return { httpStatus: 404 };
      }

      if (res.status >= 400) {
        const body = await res.text().catch(() => "");
        if (attempt === retries) {
          return { error: `HTTP ${res.status}: ${body.slice(0, 200)}`, httpStatus: res.status };
        }
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      const json = await res.json() as { rn?: string; name?: string };
      const name = json?.name?.trim();
      if (name && name.length > 0) {
        return { name, httpStatus: res.status };
      }

      // API returned 200 but no valid name — NEVER map to NOT_FOUND
      return { error: "API returned 200 but name is empty", httpStatus: res.status };
    } catch (err) {
      if (attempt === retries) {
        return { error: String(err).slice(0, 300), httpStatus: null };
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return { error: "exhausted retries", httpStatus: null };
}

// ── Main lookup function ──

export async function lookupCasDetail(casNo: string): Promise<CasDetailResult> {
  const normalized = normalizeCas(casNo);
  const ccUrl = `${CC_DETAIL_PAGE}?cas_rn=${encodeURIComponent(normalized)}&search=${encodeURIComponent(normalized)}`;
  const start = Date.now();

  // 1) Checksum — ONLY source of INVALID
  if (!isValidCasChecksum(normalized)) {
    const reason = `CAS ${normalized} failed checksum validation`;
    console.log("CAS_DETAIL_STATUS", normalized, "INVALID_CAS");
    await auditLookup(normalized, "INVALID", null, reason);
    return {
      normalizedCas: normalized,
      casValidity: "INVALID",
      commonChemistryStatus: "NOT_FOUND",
      commonChemistryName: null,
      commonChemistryUrl: ccUrl,
      commonChemistryReason: reason,
      httpStatus: null,
    };
  }

  // 2) Check DB cache — only serve FOUND from cache.
  //    NOT_FOUND is never served from cache because a previous lookup
  //    may have failed due to API issues; always re-check with the API.
  const cached = await prisma.commonChemistryCasCache.findUnique({
    where: { casNo: normalized },
  });
  if (cached && cached.exists) {
    const ageDays = (Date.now() - cached.fetchedAt.getTime()) / 86_400_000;
    if (ageDays < CACHE_TTL_DAYS) {
      console.log("CAS_DETAIL_STATUS", normalized, "FOUND", "(cached)");
      return {
        normalizedCas: normalized,
        casValidity: "VALID",
        commonChemistryStatus: "FOUND",
        commonChemistryName: cached.title,
        commonChemistryUrl: cached.sourceUrl ?? ccUrl,
        commonChemistryReason: `Found on Common Chemistry: "${cached.title}" (cached)`,
        httpStatus: null,
      };
    }
  }

  // 3) Fetch the CC detail HTML page
  let httpStatus: number | null = null;
  let ccStatus: CommonChemistryStatus;
  let ccName: string | null = null;
  let reason: string;

  const htmlResult = await fetchDetailHtml(normalized);

  if ("error" in htmlResult) {
    // Network error or non-404 HTTP error on HTML page
    httpStatus = htmlResult.httpStatus;
    ccStatus = "NEEDS_REVIEW";
    reason = `NEEDS_REVIEW: ${htmlResult.error}`;
    console.log("CAS_DETAIL_STATUS", normalized, "NEEDS_REVIEW");
  } else if (!("html" in htmlResult)) {
    // HTML page returned 404 → NOT_FOUND
    httpStatus = 404;
    ccStatus = "NOT_FOUND";
    reason = `CAS ${normalized} not found on CAS Common Chemistry (404)`;
    console.log("CAS_DETAIL_STATUS", normalized, "NOT_FOUND");
  } else {
    // HTML page returned 200 — parse with cheerio for <h1>
    httpStatus = htmlResult.httpStatus;
    const htmlName = extractNameFromHtml(htmlResult.html);

    if (htmlName) {
      // <h1> found with text — FOUND
      ccName = htmlName;
      ccStatus = "FOUND";
      reason = `Found on Common Chemistry: "${ccName}"`;
      console.log("CAS_DETAIL_NAME", normalized, ccName);
      console.log("CAS_DETAIL_STATUS", normalized, "FOUND");
    } else {
      // <h1> not found — SPA shell; fall back to the JSON API
      console.log("CAS_DETAIL_STATUS", normalized, "HTML_NO_H1 — falling back to API");

      const apiResult = await fetchDetailApi(normalized, MAX_RETRIES);

      if ("error" in apiResult) {
        // API error → NEEDS_REVIEW (NEVER NOT_FOUND)
        httpStatus = apiResult.httpStatus;
        ccStatus = "NEEDS_REVIEW";
        reason = `Detail page returned 200 but name not parsed; API fallback failed: ${apiResult.error}`;
        console.log("CAS_DETAIL_STATUS", normalized, "NEEDS_REVIEW");
      } else if (!("name" in apiResult)) {
        // API returned 404 → NOT_FOUND
        httpStatus = 404;
        ccStatus = "NOT_FOUND";
        reason = `CAS ${normalized} not found on CAS Common Chemistry (API 404)`;
        console.log("CAS_DETAIL_STATUS", normalized, "NOT_FOUND");
      } else {
        // API returned name → FOUND
        ccName = apiResult.name;
        ccStatus = "FOUND";
        reason = `Found on Common Chemistry: "${ccName}"`;
        console.log("CAS_DETAIL_NAME", normalized, ccName);
        console.log("CAS_DETAIL_STATUS", normalized, "FOUND");
      }
    }
  }

  const ms = Date.now() - start;
  console.log("CAS_DETAIL_COMPLETE", { casNo: normalized, ccStatus, ccName, httpStatus, ms });

  // 4) Cache only FOUND results — never cache NOT_FOUND or NEEDS_REVIEW.
  //    NOT_FOUND is not cached because the API may have been temporarily broken.
  if (ccStatus === "FOUND") {
    try {
      await prisma.commonChemistryCasCache.upsert({
        where: { casNo: normalized },
        create: {
          casNo: normalized,
          exists: ccStatus === "FOUND",
          title: ccName,
          sourceUrl: ccUrl,
          fetchedAt: new Date(),
        },
        update: {
          exists: ccStatus === "FOUND",
          title: ccName,
          sourceUrl: ccUrl,
          fetchedAt: new Date(),
        },
      });
    } catch (err) {
      console.error("CC_CACHE_ERROR", { casNo: normalized, error: String(err) });
    }
  }

  // 5) Audit
  await auditLookup(normalized, "VALID", httpStatus, reason);

  return {
    normalizedCas: normalized,
    casValidity: "VALID",
    commonChemistryStatus: ccStatus,
    commonChemistryName: ccName,
    commonChemistryUrl: ccUrl,
    commonChemistryReason: reason,
    httpStatus,
  };
}

// ── Batch (sequential with 1s delay to respect rate limits) ──

export async function lookupCasDetailBatch(
  casNumbers: string[],
): Promise<Map<string, CasDetailResult>> {
  const results = new Map<string, CasDetailResult>();
  const unique = [...new Set(casNumbers.map(normalizeCas))];
  for (let i = 0; i < unique.length; i++) {
    results.set(unique[i], await lookupCasDetail(unique[i]));
    if (i < unique.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return results;
}

// ── Audit ──

async function auditLookup(
  casNo: string,
  casValidity: string,
  httpStatus: number | null,
  reason: string,
) {
  try {
    await writeAuditLog({
      action: "CAS_COMMON_CHEMISTRY_LOOKUP",
      entityType: "cas_lookup",
      entityId: casNo,
      requestId: `cas-${casNo}-${Date.now()}`,
      metadata: { casNo, casValidity, httpStatus, reason, source: "commonchemistry.cas.org" },
    });
  } catch {
    // swallow
  }
}
