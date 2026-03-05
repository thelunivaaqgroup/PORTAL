/**
 * Offline Evidence Pack ingestion for Banned/Restricted chemicals.
 *
 * Ingests local PDF files (AICIS hub, Rotterdam, Minamata, Stockholm,
 * Poisons Standard) into a new BannedRestrictedSnapshot without requiring
 * live web access.
 *
 * For each file:
 *   1. Read bytes, compute SHA-256
 *   2. Extract text via pdf-parse
 *   3. Extract CAS numbers with context
 *   4. For POISONS_STANDARD: also extract substance names + schedule numbers
 *   5. Persist BannedRestrictedSource + BannedRestrictedChemical rows
 *
 * CRITICAL INVARIANTS:
 *   - Only real extracted data is stored — never fabricated
 *   - Uses DB transactions — no partial/inconsistent state
 *   - isComplete = true only if >=1 source succeeded AND (>=1 CAS indexed OR poisons name-only entries exist)
 *   - Every source records file hash for deterministic auditing
 */

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { extractCasFromText } from "./extractCas.js";
import type { BannedRestrictedLinkType } from "@prisma/client";
import type { BannedRestrictedSyncResult } from "./bannedRestricted.types.js";

// ── Helpers ──

function sha256(data: Buffer | string): string {
  return createHash("sha256")
    .update(typeof data === "string" ? Buffer.from(data, "utf-8") : data)
    .digest("hex");
}

/** Map of linkType to human-readable label */
const SOURCE_LABELS: Record<string, string> = {
  HUB: "AICIS – Banned or restricted chemicals (hub page)",
  ROTTERDAM_IMPORT: "Rotterdam Convention – Import Authorisation",
  ROTTERDAM_EXPORT: "Rotterdam Convention – Export Authorisation",
  MINAMATA: "Minamata Convention – Mercury Import/Export",
  STOCKHOLM: "Stockholm Convention – POPs",
  STOCKHOLM_POP: "Stockholm Convention – All POPs Listing",
  POISONS_STANDARD: "Poisons Standard (SUSMP February 2026)",
  MINAMATA_TREATY: "Minamata Convention – Treaty Text",
  ROTTERDAM_PIC: "Rotterdam Convention – PIC Annex III",
  OTHER: "Other Evidence Source",
};

// ── Poisons Standard Extraction ──

/**
 * Scheduled substance entry from the Poisons Standard.
 * Some entries have CAS numbers, many are name-only.
 */
export type PoisonsScheduleEntry = {
  substanceName: string;
  scheduleNumber: string | null;
  casNo: string | null;
  matchText: string;
};

/**
 * Extract scheduled substance entries from Poisons Standard PDF text.
 *
 * The Poisons Standard lists substances under schedule headings
 * (Schedule 2, 3, 4, 5, 6, 7, 8, 9, 10).
 *
 * We look for:
 *  - Schedule headings to track current schedule context
 *  - Substance name lines (capitalized entries, often ALL-CAPS or Title-Case)
 *  - CAS numbers when present in the line or nearby
 */
export function extractPoisonsScheduleEntries(text: string): PoisonsScheduleEntry[] {
  const lines = text.split("\n");
  const entries: PoisonsScheduleEntry[] = [];
  const seen = new Set<string>();
  let currentSchedule: string | null = null;

  // Pattern for schedule headings: "Schedule 4", "SCHEDULE 4", etc.
  const scheduleHeadingPattern = /^[\s]*(?:SCHEDULE|Schedule)\s+(\d+)/i;
  // Pattern for substance-like lines: starts with letter, not too short, has alpha chars
  const substancePattern = /^[A-Z][A-Za-z0-9\s,\-'()\[\]\/\.]+$/;
  // CAS pattern
  const casPattern = /\b(\d{2,7}-\d{2}-\d)\b/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+/g, " ").trim();
    if (!line) continue;

    // Check for schedule heading
    const schedMatch = scheduleHeadingPattern.exec(line);
    if (schedMatch) {
      currentSchedule = schedMatch[1];
      continue;
    }

    // Skip very short lines, page numbers, etc.
    if (line.length < 3) continue;
    if (/^\d+$/.test(line)) continue; // pure page numbers
    if (/^(Part|Division|Chapter|Section|Note|Appendix)\s/i.test(line)) continue;

    // Check for CAS numbers in this line
    casPattern.lastIndex = 0;
    let casMatch: RegExpExecArray | null;
    const casNumbers: string[] = [];
    while ((casMatch = casPattern.exec(line)) !== null) {
      casNumbers.push(
        casMatch[1].trim().replace(/[\u2010-\u2015]/g, "-"),
      );
    }

    // If line looks like a substance entry (has CAS or matches substance pattern)
    if (casNumbers.length > 0) {
      // Lines with CAS: extract substance name from text before the CAS
      for (const cas of casNumbers) {
        const casIdx = line.indexOf(cas);
        const beforeCas = line.slice(0, casIdx).trim().replace(/[,;:\s]+$/, "");
        const substanceName = beforeCas.length >= 2 ? beforeCas : line;

        const key = `${cas}:${currentSchedule ?? "?"}`;
        if (seen.has(key)) continue;
        seen.add(key);

        entries.push({
          substanceName,
          scheduleNumber: currentSchedule,
          casNo: cas,
          matchText: line.length > 500 ? line.slice(0, 500) : line,
        });
      }
    } else if (substancePattern.test(line) && line.length >= 4 && line.length <= 200) {
      // Name-only substance entry (common in Poisons Standard)
      // Only capture if it starts with uppercase and looks like a chemical/substance name
      const nameKey = line.toUpperCase();
      if (seen.has(nameKey)) continue;
      seen.add(nameKey);

      entries.push({
        substanceName: line,
        scheduleNumber: currentSchedule,
        casNo: null,
        matchText: line,
      });
    }
  }

  return entries;
}

/**
 * Generate a deterministic key for a name-only substance (no CAS).
 * Format: "NAME_ONLY:<sha256 of uppercased name, first 16 hex chars>"
 */
export function nameOnlyCasKey(name: string): string {
  const hash = createHash("sha256")
    .update(name.toUpperCase().trim())
    .digest("hex")
    .slice(0, 16);
  return `NAME_ONLY:${hash}`;
}

// ── Main ingestion ──

export type EvidencePackFile = {
  linkType: BannedRestrictedLinkType;
  filePath: string;
  originalName?: string;
};

export type IngestEvidencePackResult = BannedRestrictedSyncResult & {
  poisonsNameOnlyCount: number;
  fileDetails: {
    fileName: string;
    linkType: string;
    casCount: number;
    nameOnlyCount: number;
    status: "SUCCESS" | "FAILED";
    error?: string;
  }[];
};

/**
 * Ingest an offline evidence pack of PDF files.
 *
 * Creates a single BannedRestrictedSnapshot with sourceUrl="OFFLINE_EVIDENCE_PACK".
 * All work is done inside a Prisma transaction to prevent partial state.
 */
export async function ingestEvidencePack(
  actorUserId: string,
  files: EvidencePackFile[],
  packLabel?: string,
): Promise<IngestEvidencePackResult> {
  const startMs = Date.now();
  const label = packLabel ?? `AU_BR_${new Date().toISOString().slice(0, 10).replace(/-/g, "_")}`;

  logger.info({ fileCount: files.length, label }, "Starting evidence pack ingestion");

  // Pre-read all files to compute composite hash
  const fileBuffers: { file: EvidencePackFile; buffer: Buffer; hash: string; size: number }[] = [];
  for (const file of files) {
    try {
      const buffer = await readFile(file.filePath);
      fileBuffers.push({
        file,
        buffer,
        hash: sha256(buffer),
        size: buffer.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ filePath: file.filePath, error: msg }, "Cannot read evidence file");
      throw new Error(`Cannot read file "${file.filePath}": ${msg}`);
    }
  }

  // Composite content hash for the entire pack
  const compositeHash = sha256(
    fileBuffers.map((f) => f.hash).sort().join("|"),
  );

  // Run everything in a transaction
  const result = await prisma.$transaction(
    async (tx) => {
      // 1. Create snapshot
      const snap = await tx.bannedRestrictedSnapshot.create({
        data: {
          sourceUrl: "OFFLINE_EVIDENCE_PACK",
          contentHash: compositeHash,
          isComplete: false,
          notes: `Ingesting evidence pack "${label}" (${files.length} files)...`,
          createdByUserId: actorUserId,
        },
      });
      const snapshotId = snap.id;

      let totalCas = 0;
      let totalNameOnly = 0;
      let totalSuccess = 0;
      let totalFailed = 0;
      const notesParts: string[] = [];
      const fileDetails: IngestEvidencePackResult["fileDetails"] = [];

      for (const { file, buffer, hash, size } of fileBuffers) {
        const fileName = file.originalName ?? basename(file.filePath);
        try {
          // 2. Extract text from PDF
          let extractedText: string;
          const isPdf = fileName.toLowerCase().endsWith(".pdf");

          if (isPdf) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pdfParse: (buf: Buffer) => Promise<{ text: string; numpages: number }> =
              ((await import("pdf-parse")) as any).default;
            const pdfData = await pdfParse(buffer);
            extractedText = pdfData.text;
            logger.info(
              { file: fileName, pages: pdfData.numpages, textLen: extractedText.length },
              "PDF text extracted",
            );
          } else {
            extractedText = buffer.toString("utf-8");
          }

          // 3. Create source row
          const source = await tx.bannedRestrictedSource.create({
            data: {
              snapshotId,
              sourceName: SOURCE_LABELS[file.linkType] ?? `Evidence: ${fileName}`,
              sourceUrl: `file://${file.filePath}`,
              linkType: file.linkType,
              fetchStatus: "SUCCESS",
              contentHash: hash,
              rawContentSize: size,
              rawHtml: null, // Don't store full PDF text for offline packs
              screenshotPath: file.filePath,
              errorMessage: null,
            },
          });

          let casCount = 0;
          let nameOnlyCount = 0;

          if (file.linkType === "POISONS_STANDARD") {
            // 4a. Poisons Standard: extract schedule entries (CAS + name-only)
            const entries = extractPoisonsScheduleEntries(extractedText);

            for (const entry of entries) {
              const normalizedCas = entry.casNo ?? nameOnlyCasKey(entry.substanceName);
              const isCas = entry.casNo !== null;

              try {
                await tx.bannedRestrictedChemical.create({
                  data: {
                    snapshotId,
                    sourceId: source.id,
                    normalizedCasNo: normalizedCas,
                    chemicalName: entry.substanceName,
                    matchText: entry.matchText,
                    evidenceUrl: `file://${file.filePath}`,
                  },
                });
                if (isCas) casCount++;
                else nameOnlyCount++;
              } catch (err) {
                const msg = err instanceof Error ? err.message : "";
                if (msg.includes("Unique constraint")) {
                  logger.debug({ cas: normalizedCas }, "Duplicate entry — skipping");
                } else {
                  throw err;
                }
              }
            }

            notesParts.push(
              `POISONS_STANDARD: ${casCount} CAS + ${nameOnlyCount} name-only from "${fileName}"`,
            );
          } else if (file.linkType !== "HUB") {
            // 4b. Standard CAS extraction for treaty/convention PDFs
            const hits = extractCasFromText(extractedText);

            for (const hit of hits) {
              try {
                await tx.bannedRestrictedChemical.create({
                  data: {
                    snapshotId,
                    sourceId: source.id,
                    normalizedCasNo: hit.normalizedCasNo,
                    chemicalName: hit.chemicalName,
                    matchText: hit.matchText,
                    evidenceUrl: `file://${file.filePath}`,
                  },
                });
                casCount++;
              } catch (err) {
                const msg = err instanceof Error ? err.message : "";
                if (msg.includes("Unique constraint")) {
                  logger.debug({ cas: hit.normalizedCasNo }, "Duplicate CAS — skipping");
                } else {
                  throw err;
                }
              }
            }

            notesParts.push(
              `${file.linkType}: ${casCount} CAS chemicals from "${fileName}"`,
            );
          } else {
            notesParts.push(`HUB: indexed as reference from "${fileName}"`);
          }

          totalCas += casCount;
          totalNameOnly += nameOnlyCount;
          totalSuccess++;
          fileDetails.push({
            fileName,
            linkType: file.linkType,
            casCount,
            nameOnlyCount,
            status: "SUCCESS",
          });
        } catch (err) {
          totalFailed++;
          const errMsg = err instanceof Error ? err.message.slice(0, 300) : String(err);
          logger.error({ file: fileName, error: errMsg }, "Evidence file ingestion failed");

          // Create a FAILED source row for audit
          await tx.bannedRestrictedSource.create({
            data: {
              snapshotId,
              sourceName: SOURCE_LABELS[file.linkType] ?? `Evidence: ${fileName}`,
              sourceUrl: `file://${file.filePath}`,
              linkType: file.linkType,
              fetchStatus: "FAILED",
              contentHash: hash,
              rawContentSize: size,
              errorMessage: `[PARSE_ERROR] ${errMsg}`,
              screenshotPath: file.filePath,
            },
          });

          notesParts.push(`${file.linkType}: FAILED (${errMsg.slice(0, 100)})`);
          fileDetails.push({
            fileName,
            linkType: file.linkType,
            casCount: 0,
            nameOnlyCount: 0,
            status: "FAILED",
            error: errMsg,
          });
        }
      }

      // 5. Determine completeness
      // Complete if: at least 1 source succeeded AND
      //   (at least 1 CAS indexed OR at least 1 name-only entry for poisons standard)
      const hasChemicalData = totalCas > 0 || totalNameOnly > 0;
      const isComplete = totalSuccess >= 1 && hasChemicalData;

      const durationMs = Date.now() - startMs;
      const finalNotes = [
        `Evidence pack "${label}" ingested from ${files.length} file(s).`,
        `Sources: ${totalSuccess} succeeded, ${totalFailed} failed.`,
        `CAS chemicals: ${totalCas}. Name-only entries: ${totalNameOnly}.`,
        totalNameOnly > 0
          ? "Poisons Standard is name-based; CAS coverage partial. Name matching is used for verification."
          : "",
        ...notesParts,
        `Duration: ${(durationMs / 1000).toFixed(1)}s.`,
      ]
        .filter(Boolean)
        .join(" ");

      // 6. Finalize snapshot
      await tx.bannedRestrictedSnapshot.update({
        where: { id: snapshotId },
        data: { isComplete, notes: finalNotes },
      });

      return {
        snapshotId,
        sourcesTotal: files.length,
        sourcesSuccess: totalSuccess,
        sourcesFailed: totalFailed,
        chemicalsCount: totalCas + totalNameOnly,
        isComplete,
        poisonsNameOnlyCount: totalNameOnly,
        fileDetails,
      };
    },
    { timeout: 120_000 },
  );

  logger.info(result, "Evidence pack ingestion complete");
  return result;
}
