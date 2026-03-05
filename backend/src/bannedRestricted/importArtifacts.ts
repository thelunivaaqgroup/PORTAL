import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { extractCasFromText, extractCasFromHtml } from "./extractCas.js";
import type { BannedRestrictedLinkType } from "@prisma/client";
import type { BannedRestrictedSyncResult } from "./bannedRestricted.types.js";

const HUB_URL =
  "https://www.industrialchemicals.gov.au/chemical-information/banned-or-restricted-chemicals";

/** Official source URLs for validation */
export const KNOWN_SOURCE_URLS: Record<string, string> = {
  HUB: "https://www.industrialchemicals.gov.au/chemical-information/banned-or-restricted-chemicals",
  ROTTERDAM_IMPORT:
    "https://www.industrialchemicals.gov.au/chemical-information/banned-or-restricted-chemicals/chemicals-listed-rotterdam-and-stockholm-conventions/apply-annual-import-authorisation-rotterdam-convention",
  ROTTERDAM_EXPORT:
    "https://www.industrialchemicals.gov.au/chemical-information/banned-or-restricted-chemicals/chemicals-listed-rotterdam-and-stockholm-conventions/apply-annual-export-authorisation-rotterdam-convention",
  MINAMATA:
    "https://www.industrialchemicals.gov.au/chemical-information/banned-or-restricted-chemicals/importing-or-exporting-mercury",
  POISONS_STANDARD:
    "https://www.legislation.gov.au/F2021L00650/latest/text",
};

/** Source label for display */
const SOURCE_LABELS: Record<string, string> = {
  HUB: "AICIS – Banned or restricted chemicals (hub page)",
  ROTTERDAM_IMPORT: "Rotterdam Convention – Import Authorisation",
  ROTTERDAM_EXPORT: "Rotterdam Convention – Export Authorisation",
  MINAMATA: "Minamata Convention – Mercury Import/Export",
  POISONS_STANDARD: "Poisons Standard (February 2026)",
};

/** Allowed link types for artifact upload */
const ALLOWED_LINK_TYPES = new Set<string>([
  "HUB",
  "ROTTERDAM_IMPORT",
  "ROTTERDAM_EXPORT",
  "MINAMATA",
  "POISONS_STANDARD",
  "STOCKHOLM",
  "OTHER",
]);

function sha256(data: Buffer | string): string {
  return createHash("sha256")
    .update(typeof data === "string" ? data : data)
    .digest("hex");
}

export type ArtifactFile = {
  linkType: BannedRestrictedLinkType;
  sourceUrl: string;
  filePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * Import uploaded PDF/HTML artifacts as a new BannedRestrictedSnapshot.
 *
 * For each file:
 *   1. Read file bytes from disk
 *   2. Compute SHA256 content hash
 *   3. Extract text (pdf-parse for PDFs, raw read for HTML/text)
 *   4. Extract CAS numbers from text
 *   5. Create BannedRestrictedSource + BannedRestrictedChemical rows
 *
 * CRITICAL INVARIANTS:
 *   - Only real extracted CAS numbers are stored — never fabricated
 *   - isComplete = true only if at least 1 chemical was extracted
 *   - Every source row records the artifact file path for audit trail
 *   - Never throws on individual file parse failure (logs and continues)
 */
export async function importArtifacts(
  actorUserId: string,
  files: ArtifactFile[],
): Promise<BannedRestrictedSyncResult> {
  logger.info(
    { fileCount: files.length },
    "Starting banned/restricted artifact import",
  );

  // Validate link types
  for (const f of files) {
    if (!ALLOWED_LINK_TYPES.has(f.linkType)) {
      throw new Error(`Invalid linkType: ${f.linkType}`);
    }
  }

  // 1. Create snapshot
  const snap = await prisma.bannedRestrictedSnapshot.create({
    data: {
      sourceUrl: HUB_URL,
      contentHash: "pending",
      isComplete: false,
      notes: "Importing from uploaded artifacts...",
      createdByUserId: actorUserId,
    },
  });
  const snapshotId = snap.id;
  logger.info({ snapshotId }, "Snapshot created for artifact import");

  let totalChemicals = 0;
  let totalSuccess = 0;
  let totalFailed = 0;
  const notesParts: string[] = [];

  for (const artifact of files) {
    try {
      // 2. Read file
      const fileBuffer = await readFile(artifact.filePath);
      const contentHash = sha256(fileBuffer);

      // 3. Extract text based on file type
      let extractedText: string;
      const isPdf =
        artifact.mimeType === "application/pdf" ||
        artifact.originalName.toLowerCase().endsWith(".pdf");

      if (isPdf) {
        // Dynamic import for pdf-parse (CommonJS module, no type declarations)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfParse: (buf: Buffer) => Promise<{ text: string; numpages: number }> =
          ((await import("pdf-parse")) as any).default;
        const pdfData = await pdfParse(fileBuffer);
        extractedText = pdfData.text;
        logger.info(
          {
            file: artifact.originalName,
            pages: pdfData.numpages,
            textLen: extractedText.length,
          },
          "PDF text extracted",
        );
      } else {
        // HTML or plain text file
        extractedText = fileBuffer.toString("utf-8");
      }

      // 4. Create source row
      const source = await prisma.bannedRestrictedSource.create({
        data: {
          snapshotId,
          sourceName:
            SOURCE_LABELS[artifact.linkType] ??
            `Uploaded: ${artifact.originalName}`,
          sourceUrl: artifact.sourceUrl,
          linkType: artifact.linkType,
          fetchStatus: "SUCCESS",
          contentHash,
          rawContentSize: extractedText.length,
          rawHtml: extractedText, // stores extracted text for audit
          screenshotPath: artifact.filePath, // path to uploaded artifact
          errorMessage: null,
        },
      });

      // 5. Extract CAS numbers
      const hits = isPdf
        ? extractCasFromText(extractedText)
        : extractCasFromHtml(extractedText);

      logger.info(
        {
          file: artifact.originalName,
          linkType: artifact.linkType,
          casCount: hits.length,
        },
        "CAS extraction from artifact complete",
      );

      // 6. Create chemical rows (skip HUB — it's the index page, not evidence)
      let sourceChemicals = 0;
      if (artifact.linkType !== "HUB") {
        for (const hit of hits) {
          try {
            await prisma.bannedRestrictedChemical.create({
              data: {
                snapshotId,
                sourceId: source.id,
                normalizedCasNo: hit.normalizedCasNo,
                chemicalName: hit.chemicalName,
                matchText: hit.matchText,
                evidenceUrl: artifact.sourceUrl,
              },
            });
            sourceChemicals++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : "";
            if (msg.includes("Unique constraint")) {
              logger.debug(
                { cas: hit.normalizedCasNo },
                "Duplicate CAS in artifact — skipping",
              );
            } else {
              logger.error({ error: msg }, "Failed to insert chemical");
            }
          }
        }
      }

      totalChemicals += sourceChemicals;
      totalSuccess++;
      notesParts.push(
        `${artifact.linkType}: ${sourceChemicals} chemicals from "${artifact.originalName}"`,
      );
    } catch (err) {
      totalFailed++;
      const message = err instanceof Error ? err.message.slice(0, 300) : String(err);
      logger.error(
        { file: artifact.originalName, error: message },
        "Artifact import failed for file",
      );

      // Still create a FAILED source row for audit
      await prisma.bannedRestrictedSource.create({
        data: {
          snapshotId,
          sourceName:
            SOURCE_LABELS[artifact.linkType] ??
            `Uploaded: ${artifact.originalName}`,
          sourceUrl: artifact.sourceUrl,
          linkType: artifact.linkType,
          fetchStatus: "FAILED",
          errorMessage: `[PARSE_ERROR] ${message}`,
          screenshotPath: artifact.filePath,
        },
      });

      notesParts.push(
        `${artifact.linkType}: FAILED (${message.slice(0, 100)})`,
      );
    }
  }

  // 7. Finalize snapshot
  const isComplete = totalChemicals > 0;

  const compositeHash =
    totalSuccess > 0
      ? sha256(notesParts.sort().join("|"))
      : `IMPORT_FAILED_${snapshotId}`;

  const finalNotes = [
    `Imported from ${files.length} uploaded artifact(s).`,
    `Sources: ${totalSuccess} succeeded, ${totalFailed} failed.`,
    `CAS chemicals extracted: ${totalChemicals}.`,
    ...notesParts,
  ].join(" ");

  await prisma.bannedRestrictedSnapshot.update({
    where: { id: snapshotId },
    data: { contentHash: compositeHash, isComplete, notes: finalNotes },
  });

  const result: BannedRestrictedSyncResult = {
    snapshotId,
    sourcesTotal: files.length,
    sourcesSuccess: totalSuccess,
    sourcesFailed: totalFailed,
    chemicalsCount: totalChemicals,
    isComplete,
  };

  logger.info(result, "Banned/restricted artifact import finished");
  return result;
}
