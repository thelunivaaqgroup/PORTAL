import { createHash } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { browserFetch, type BrowserFetchOptions } from "../lib/browserFetch.js";
import { extractCasFromHtml } from "./extractCas.js";
import type { BannedRestrictedLinkType } from "@prisma/client";
import type { BannedRestrictedSyncResult } from "./bannedRestricted.types.js";

// ── Source-of-truth URLs (authoritative, never fabricated) ──

const HUB_URL =
  "https://www.industrialchemicals.gov.au/chemical-information/banned-or-restricted-chemicals";

type SourceDef = {
  url: string;
  title: string;
  linkType: BannedRestrictedLinkType;
  fetchOpts?: BrowserFetchOptions;
};

/** Primary AICIS sources (may be blocked by Akamai from non-AU IPs) */
const AICIS_SOURCES: SourceDef[] = [
  {
    url: HUB_URL,
    title: "AICIS – Banned or restricted chemicals (hub page)",
    linkType: "HUB",
  },
  {
    url: "https://www.industrialchemicals.gov.au/chemical-information/banned-or-restricted-chemicals/chemicals-listed-rotterdam-and-stockholm-conventions/apply-annual-import-authorisation-rotterdam-convention",
    title: "Rotterdam Convention – Import Authorisation",
    linkType: "ROTTERDAM_IMPORT",
  },
  {
    url: "https://www.industrialchemicals.gov.au/chemical-information/banned-or-restricted-chemicals/chemicals-listed-rotterdam-and-stockholm-conventions/apply-annual-export-authorisation-rotterdam-convention",
    title: "Rotterdam Convention – Export Authorisation",
    linkType: "ROTTERDAM_EXPORT",
  },
  {
    url: "https://www.industrialchemicals.gov.au/chemical-information/banned-or-restricted-chemicals/importing-or-exporting-mercury",
    title: "Minamata Convention – Mercury Import/Export",
    linkType: "MINAMATA",
  },
];

/** Fallback upstream treaty sources — used when AICIS evidence pages fail */
const UPSTREAM_SOURCES: SourceDef[] = [
  {
    url: "https://pic.int/TheConvention/Chemicals/AnnexIIIChemicals/tabid/1132/language/en-US/Default.aspx",
    title: "Rotterdam Convention – PIC Annex III Chemicals",
    linkType: "ROTTERDAM_PIC",
    // PIC table is dynamically rendered; needs networkidle + extra settle
    fetchOpts: { waitUntil: "networkidle", settleMs: 5000 },
  },
  {
    url: "http://chm.pops.int/TheConvention/ThePOPs/AllPOPs/tabid/2509/Default.aspx",
    title: "Stockholm Convention – All POPs Listing",
    linkType: "STOCKHOLM_POP",
  },
  {
    url: "https://mercuryconvention.org/en/resources/minamata-convention-mercury-text-and-annexes",
    title: "Minamata Convention – Text and Annexes",
    linkType: "MINAMATA_TREATY",
  },
];

/** Exported for UI to display source-of-truth links regardless of fetch outcome. */
export const SOURCE_OF_TRUTH_URLS = AICIS_SOURCES.map((s) => ({
  label: s.title,
  url: s.url,
}));

// ── Screenshots directory ──

const SCREENSHOTS_DIR = join(
  process.cwd(),
  "data",
  "banned-restricted-screenshots",
);

// ── Helpers ──

function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

async function ensureScreenshotDir(): Promise<void> {
  await mkdir(SCREENSHOTS_DIR, { recursive: true });
}

async function saveScreenshot(
  snapshotId: string,
  sourceLabel: string,
  png: Buffer,
): Promise<string> {
  await ensureScreenshotDir();
  const safeName = sourceLabel.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
  const filename = `${snapshotId}_${safeName}_${Date.now()}.png`;
  const filepath = join(SCREENSHOTS_DIR, filename);
  await writeFile(filepath, png);
  return filepath;
}

function classifyError(err: unknown): { errorType: string; message: string } {
  if (!(err instanceof Error)) return { errorType: "UNKNOWN", message: String(err) };
  const msg = err.message;
  if (msg.includes("Timeout") || msg.includes("timeout"))
    return { errorType: "TIMEOUT", message: msg.slice(0, 500) };
  if (msg.includes("ERR_HTTP2_PROTOCOL_ERROR"))
    return { errorType: "HTTP2_PROTOCOL_ERROR", message: msg.slice(0, 500) };
  if (msg.includes("net::"))
    return { errorType: "NETWORK_ERROR", message: msg.slice(0, 500) };
  if (msg.includes("ERR_NAME_NOT_RESOLVED"))
    return { errorType: "DNS_FAILURE", message: msg.slice(0, 500) };
  if (msg.includes("403") || msg.includes("Forbidden"))
    return { errorType: "HTTP_403", message: msg.slice(0, 500) };
  return { errorType: "FETCH_ERROR", message: msg.slice(0, 500) };
}

// ── Sync logic ──

type SourceFetchResult = {
  url: string;
  title: string;
  linkType: BannedRestrictedLinkType;
  success: boolean;
  html: string | null;
  contentHash: string | null;
  rawContentSize: number | null;
  screenshotPath: string | null;
  errorType: string | null;
  errorMessage: string | null;
};

/** Fetch a single source, returning a result that never throws. */
async function fetchSource(
  source: SourceDef,
  snapshotId: string,
): Promise<SourceFetchResult> {
  try {
    logger.info({ url: source.url, linkType: source.linkType }, "Fetching source");
    const result = await browserFetch(source.url, source.fetchOpts);

    // Check for HTTP 403 returned as a page (e.g., Minamata returns 403 as rendered HTML)
    if (result.html.length < 1000 && result.title.toLowerCase().includes("forbidden")) {
      return {
        url: source.url,
        title: source.title,
        linkType: source.linkType,
        success: false,
        html: result.html,
        contentHash: null,
        rawContentSize: result.html.length,
        screenshotPath: null,
        errorType: "HTTP_403",
        errorMessage: "Server returned 403 Forbidden",
      };
    }

    const hash = sha256(result.html);
    let screenshotPath: string | null = null;
    try {
      screenshotPath = await saveScreenshot(snapshotId, source.linkType, result.screenshot);
    } catch (screenshotErr) {
      logger.warn({ error: screenshotErr }, "Failed to save screenshot (non-fatal)");
    }

    return {
      url: source.url,
      title: result.title || source.title,
      linkType: source.linkType,
      success: true,
      html: result.html,
      contentHash: hash,
      rawContentSize: result.html.length,
      screenshotPath,
      errorType: null,
      errorMessage: null,
    };
  } catch (err) {
    const { errorType, message } = classifyError(err);
    logger.warn({ url: source.url, errorType, error: message }, "Source fetch failed");
    return {
      url: source.url,
      title: source.title,
      linkType: source.linkType,
      success: false,
      html: null,
      contentHash: null,
      rawContentSize: null,
      screenshotPath: null,
      errorType,
      errorMessage: message,
    };
  }
}

/** Persist a source result to the database. */
async function persistSourceRow(
  snapshotId: string,
  sr: SourceFetchResult,
): Promise<void> {
  await prisma.bannedRestrictedSource.create({
    data: {
      snapshotId,
      sourceName: sr.title,
      sourceUrl: sr.url,
      linkType: sr.linkType,
      fetchStatus: sr.success ? "SUCCESS" : "FAILED",
      contentHash: sr.contentHash,
      rawContentSize: sr.rawContentSize,
      rawHtml: sr.html,
      screenshotPath: sr.screenshotPath,
      errorMessage: sr.errorType
        ? `[${sr.errorType}] ${sr.errorMessage}`
        : sr.errorMessage,
    },
  });
}

/** Extract CAS chemicals from a successful source and insert into DB. Returns count. */
async function extractAndPersistChemicals(
  snapshotId: string,
  sr: SourceFetchResult,
): Promise<number> {
  if (!sr.success || !sr.html) return 0;

  const sourceRecord = await prisma.bannedRestrictedSource.findFirst({
    where: { snapshotId, sourceUrl: sr.url },
    select: { id: true },
  });
  if (!sourceRecord) return 0;

  const hits = extractCasFromHtml(sr.html);
  logger.info(
    { sourceUrl: sr.url, casCount: hits.length },
    "CAS extraction complete",
  );

  let count = 0;
  for (const hit of hits) {
    try {
      await prisma.bannedRestrictedChemical.create({
        data: {
          snapshotId,
          sourceId: sourceRecord.id,
          normalizedCasNo: hit.normalizedCasNo,
          chemicalName: hit.chemicalName,
          matchText: hit.matchText,
          evidenceUrl: sr.url,
        },
      });
      count++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Unique constraint")) {
        logger.debug({ cas: hit.normalizedCasNo }, "Duplicate CAS — skipping");
      } else {
        logger.error({ error: msg }, "Failed to insert chemical");
      }
    }
  }

  return count;
}

/**
 * Sync banned/restricted data by fetching official AICIS pages via Playwright,
 * with fallback to upstream treaty sources when AICIS is unreachable.
 *
 * CRITICAL INVARIANTS:
 *   - ALWAYS creates a banned_restricted_snapshot row (even on total failure)
 *   - ALWAYS creates one banned_restricted_source row per attempted URL (even on failure)
 *   - isComplete = true ONLY IF at least 1 banned_restricted_chemical row inserted
 *   - NEVER throws — always returns a BannedRestrictedSyncResult with snapshotId
 *   - On failure: notes contain errorType + message for audit trail
 *
 * FALLBACK STRATEGY:
 *   1. Attempt all AICIS sources (hub + evidence pages)
 *   2. If no chemicals extracted from AICIS evidence pages, fetch upstream treaty sources
 *      (PIC Rotterdam Annex III, Stockholm POPs, Minamata Convention)
 *   3. Extract CAS from whichever sources succeeded
 *   4. Notes reflect whether data came from AICIS or upstream fallback
 */
export async function syncBannedRestricted(
  actorUserId: string,
): Promise<BannedRestrictedSyncResult> {
  logger.info("Starting banned/restricted sync via Playwright");

  // 1. Create snapshot immediately — guarantees an audit artifact exists
  const snap = await prisma.bannedRestrictedSnapshot.create({
    data: {
      sourceUrl: HUB_URL,
      contentHash: "pending",
      isComplete: false,
      notes: "Sync in progress...",
      createdByUserId: actorUserId,
    },
  });
  const snapshotId = snap.id;
  logger.info({ snapshotId }, "Snapshot created");

  const allResults: SourceFetchResult[] = [];
  let totalChemicals = 0;
  let usedUpstreamFallback = false;

  // ── Phase 1: Attempt AICIS sources ──
  logger.info("Phase 1: Fetching AICIS sources");
  const aicisResults: SourceFetchResult[] = [];

  for (const source of AICIS_SOURCES) {
    const result = await fetchSource(source, snapshotId);
    aicisResults.push(result);
    allResults.push(result);
    await persistSourceRow(snapshotId, result);
  }

  // Extract CAS from successful AICIS evidence sources (not HUB)
  const aicisEvidence = aicisResults.filter(
    (s) => s.success && s.html && s.linkType !== "HUB",
  );
  for (const sr of aicisEvidence) {
    totalChemicals += await extractAndPersistChemicals(snapshotId, sr);
  }

  logger.info(
    { aicisSuccess: aicisEvidence.length, chemicals: totalChemicals },
    "Phase 1 complete",
  );

  // ── Phase 2: Fallback to upstream treaty sources if no chemicals from AICIS ──
  if (totalChemicals === 0) {
    logger.info("Phase 2: No chemicals from AICIS — attempting upstream treaty sources");
    usedUpstreamFallback = true;

    for (const source of UPSTREAM_SOURCES) {
      const result = await fetchSource(source, snapshotId);
      allResults.push(result);
      await persistSourceRow(snapshotId, result);

      if (result.success && result.html) {
        totalChemicals += await extractAndPersistChemicals(snapshotId, result);
      }
    }

    logger.info(
      { upstreamSuccess: allResults.filter((s) => s.success && UPSTREAM_SOURCES.some((u) => u.url === s.url)).length, chemicals: totalChemicals },
      "Phase 2 complete",
    );
  }

  // ── Finalize snapshot ──
  const isComplete = totalChemicals > 0;

  const aicisSuccess = aicisResults.filter((s) => s.success).length;
  const aicisTotal = aicisResults.length;
  const upstreamResults = allResults.filter((s) =>
    UPSTREAM_SOURCES.some((u) => u.url === s.url),
  );
  const upstreamSuccess = upstreamResults.filter((s) => s.success).length;
  const upstreamTotal = upstreamResults.length;

  const totalSuccess = allResults.filter((s) => s.success).length;
  const totalFailed = allResults.length - totalSuccess;

  const errorSummary = allResults
    .filter((s) => !s.success)
    .map((s) => `${s.linkType}: [${s.errorType}] ${s.errorMessage}`)
    .join(" | ");

  const notesParts: string[] = [
    `AICIS sources: ${aicisSuccess}/${aicisTotal} succeeded.`,
  ];

  if (usedUpstreamFallback) {
    notesParts.push(
      `Upstream treaty sources: ${upstreamSuccess}/${upstreamTotal} succeeded.`,
    );
    if (isComplete && aicisSuccess <= 1) {
      // Hub may have succeeded but evidence pages failed
      notesParts.push(
        "Hub unreachable or evidence pages blocked; indexed from upstream treaty sources only.",
      );
    }
  }

  notesParts.push(`CAS chemicals extracted: ${totalChemicals}.`);
  notesParts.push(`isComplete: ${isComplete}.`);

  if (totalFailed > 0) {
    notesParts.push(`Errors: ${errorSummary}`);
  }

  if (totalSuccess === 0) {
    notesParts.push(
      "ALL SOURCES UNREACHABLE. No compliance conclusions can be made.",
    );
  }

  const compositeHash =
    totalSuccess > 0
      ? sha256(
          allResults
            .map((s) => s.contentHash ?? "FAILED")
            .sort()
            .join("|"),
        )
      : `ALL_FAILED_${snapshotId}`;

  await prisma.bannedRestrictedSnapshot.update({
    where: { id: snapshotId },
    data: { contentHash: compositeHash, isComplete, notes: notesParts.join(" ") },
  });

  const result: BannedRestrictedSyncResult = {
    snapshotId,
    sourcesTotal: allResults.length,
    sourcesSuccess: totalSuccess,
    sourcesFailed: totalFailed,
    chemicalsCount: totalChemicals,
    isComplete,
  };

  logger.info(result, "Banned/restricted sync finished");
  return result;
}
