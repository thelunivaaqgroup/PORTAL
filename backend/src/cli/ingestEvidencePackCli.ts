/**
 * CLI entry point for ingesting an offline banned/restricted evidence pack.
 *
 * Usage:
 *   pnpm banned:ingest --files path/to/file1.pdf path/to/file2.pdf
 *   pnpm banned:ingest --pack AU_BR_2026_03_01 --files evidence_uploads/*.pdf
 *   ACTOR_USER_ID=<userId> pnpm banned:ingest --files ...
 *
 * File naming convention (linkType inferred from filename prefix or content):
 *   HUB-*.pdf               → HUB
 *   ROTTERDAM_IMPORT-*.pdf   → ROTTERDAM_IMPORT
 *   ROTTERDAM_EXPORT-*.pdf   → ROTTERDAM_EXPORT
 *   MINAMATA-*.pdf           → MINAMATA
 *   STOCKHOLM-*.pdf          → STOCKHOLM / STOCKHOLM_POP
 *   POISONS_STANDARD-*.pdf   → POISONS_STANDARD
 *   OTHER-*.pdf              → OTHER
 *
 * Or inferred from filename keywords:
 *   *rotterdam*import*   → ROTTERDAM_IMPORT
 *   *rotterdam*export*   → ROTTERDAM_EXPORT
 *   *minamata*mercury*   → MINAMATA
 *   *stockholm*          → STOCKHOLM_POP
 *   *poisons*standard*   → POISONS_STANDARD
 *   *banned*restricted*  → HUB
 *   *aicis*hub*          → HUB
 *
 * Exit codes: 0 = success, 2 = incomplete (no chemicals), 1 = fatal
 */

import "dotenv/config";
import { resolve } from "node:path";
import { access } from "node:fs/promises";
import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { ingestEvidencePack, type EvidencePackFile } from "../bannedRestricted/ingestEvidencePack.js";
import type { BannedRestrictedLinkType } from "@prisma/client";

// ── LinkType inference ──

const PREFIX_MAP: Record<string, BannedRestrictedLinkType> = {
  HUB: "HUB",
  ROTTERDAM_IMPORT: "ROTTERDAM_IMPORT",
  ROTTERDAM_EXPORT: "ROTTERDAM_EXPORT",
  MINAMATA: "MINAMATA",
  MINAMATA_TREATY: "MINAMATA_TREATY",
  STOCKHOLM: "STOCKHOLM",
  STOCKHOLM_POP: "STOCKHOLM_POP",
  POISONS_STANDARD: "POISONS_STANDARD",
  ROTTERDAM_PIC: "ROTTERDAM_PIC",
  OTHER: "OTHER",
};

function inferLinkType(filename: string): BannedRestrictedLinkType {
  const lower = filename.toLowerCase();

  // 1. Check dash-prefix convention (e.g., "ROTTERDAM_IMPORT-document.pdf")
  const dashIdx = filename.indexOf("-");
  if (dashIdx > 0) {
    const prefix = filename.slice(0, dashIdx).toUpperCase();
    if (PREFIX_MAP[prefix]) return PREFIX_MAP[prefix];
  }

  // 2. Infer from filename keywords
  if (lower.includes("poisons") || lower.includes("susmp") || lower.includes("therapeutic")) {
    return "POISONS_STANDARD";
  }
  if (lower.includes("rotterdam") && lower.includes("import")) return "ROTTERDAM_IMPORT";
  if (lower.includes("rotterdam") && lower.includes("export")) return "ROTTERDAM_EXPORT";
  if (lower.includes("rotterdam")) return "ROTTERDAM_IMPORT"; // default rotterdam
  if (lower.includes("minamata") || lower.includes("mercury")) return "MINAMATA";
  if (lower.includes("stockholm") || lower.includes("pop")) return "STOCKHOLM_POP";
  if (lower.includes("banned") || lower.includes("restricted") || lower.includes("aicis")) {
    return "HUB";
  }
  if (lower.includes("general") && lower.includes("rules")) return "OTHER";

  return "OTHER";
}

// ── CLI ──

function printUsage() {
  console.log(`
Usage:
  pnpm banned:ingest --files <file1.pdf> [file2.pdf ...]
  pnpm banned:ingest --pack <label> --files <file1.pdf> [file2.pdf ...]

Options:
  --files <paths...>   Required. One or more PDF file paths.
  --pack <label>       Optional. Pack label (e.g., AU_BR_2026_03_01).

Environment:
  DATABASE_URL         Required (Prisma connection string)
  ACTOR_USER_ID        Optional, defaults to first SUPER_ADMIN

File Naming:
  Files can be prefixed with linkType (e.g., MINAMATA-mercury.pdf)
  or the type will be inferred from filename keywords.

Examples:
  pnpm banned:ingest --files evidence_uploads/aicis-banned-restricted-hub.pdf.pdf evidence_uploads/minamata-mercury.pdf.pdf
  pnpm banned:ingest --pack AU_BR_2026_03 --files *.pdf
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    printUsage();
    process.exit(0);
  }

  // Parse args
  let packLabel: string | undefined;
  const filePaths: string[] = [];
  let i = 0;
  while (i < args.length) {
    if (args[i] === "--pack" && args[i + 1]) {
      packLabel = args[i + 1];
      i += 2;
    } else if (args[i] === "--files") {
      i++;
      while (i < args.length && !args[i].startsWith("--")) {
        filePaths.push(args[i]);
        i++;
      }
    } else {
      // Treat bare args as file paths
      filePaths.push(args[i]);
      i++;
    }
  }

  if (filePaths.length === 0) {
    console.error("ERROR: No files specified. Use --files <path1> [path2 ...]");
    printUsage();
    process.exit(1);
  }

  // Resolve and validate file paths
  const resolvedFiles: EvidencePackFile[] = [];
  for (const fp of filePaths) {
    const absPath = resolve(fp);
    try {
      await access(absPath);
    } catch {
      console.error(`ERROR: File not found or not readable: ${absPath}`);
      process.exit(1);
    }
    const linkType = inferLinkType(fp);
    resolvedFiles.push({
      linkType,
      filePath: absPath,
      originalName: fp.split("/").pop() ?? fp,
    });
  }

  console.log("\n=== Banned/Restricted Evidence Pack Ingestion ===\n");
  console.log("Files to ingest:");
  for (const f of resolvedFiles) {
    console.log(`  [${f.linkType.padEnd(20)}] ${f.originalName}`);
  }
  console.log();

  // Resolve actor user
  let actorUserId = process.env.ACTOR_USER_ID;
  if (!actorUserId) {
    logger.info("No ACTOR_USER_ID set — looking up first SUPER_ADMIN");
    const admin = await prisma.user.findFirst({
      where: { role: "SUPER_ADMIN", isActive: true },
      select: { id: true, email: true },
    });
    if (!admin) {
      console.error("ERROR: No active SUPER_ADMIN user found. Set ACTOR_USER_ID env var.");
      process.exit(1);
    }
    actorUserId = admin.id;
    console.log(`Using admin: ${admin.email}`);
  }

  // Run ingestion
  const startMs = Date.now();
  const result = await ingestEvidencePack(actorUserId, resolvedFiles, packLabel);
  const durationSec = ((Date.now() - startMs) / 1000).toFixed(1);

  // Write audit log
  await writeAuditLog({
    actorUserId,
    action: "BANNED_RESTRICTED_PACK_INGESTED",
    entityType: "banned_restricted_snapshot",
    entityId: result.snapshotId,
    requestId: `cli-ingest-${Date.now()}`,
    metadata: {
      packLabel,
      fileCount: resolvedFiles.length,
      fileNames: resolvedFiles.map((f) => f.originalName),
      linkTypes: resolvedFiles.map((f) => f.linkType),
      sourcesTotal: result.sourcesTotal,
      sourcesSuccess: result.sourcesSuccess,
      sourcesFailed: result.sourcesFailed,
      chemicalsCount: result.chemicalsCount,
      poisonsNameOnlyCount: result.poisonsNameOnlyCount,
      isComplete: result.isComplete,
      durationMs: Date.now() - startMs,
    },
  });

  // Print result
  console.log("\n=== Ingestion Result ===");
  console.log(`  Snapshot ID:         ${result.snapshotId}`);
  console.log(`  Pack Label:          ${packLabel ?? "(auto)"}`);
  console.log(`  Sources Total:       ${result.sourcesTotal}`);
  console.log(`  Sources Success:     ${result.sourcesSuccess}`);
  console.log(`  Sources Failed:      ${result.sourcesFailed}`);
  console.log(`  CAS Chemicals:       ${result.chemicalsCount - result.poisonsNameOnlyCount}`);
  console.log(`  Name-Only (Poisons): ${result.poisonsNameOnlyCount}`);
  console.log(`  Total Indexed:       ${result.chemicalsCount}`);
  console.log(`  Is Complete:         ${result.isComplete}`);
  console.log(`  Duration:            ${durationSec}s`);

  console.log("\n  Per-file details:");
  for (const fd of result.fileDetails) {
    const status = fd.status === "SUCCESS" ? "OK" : "FAIL";
    const counts = fd.nameOnlyCount > 0
      ? `${fd.casCount} CAS + ${fd.nameOnlyCount} names`
      : `${fd.casCount} CAS`;
    console.log(`    [${status}] ${fd.linkType.padEnd(20)} ${counts.padEnd(20)} ${fd.fileName}`);
    if (fd.error) console.log(`         Error: ${fd.error}`);
  }

  console.log();

  if (!result.isComplete) {
    console.log("WARNING: Snapshot is INCOMPLETE — no chemicals were indexed.");
    console.log("  Check that your PDF files contain extractable text (not scanned images).");
    console.log();
  }

  await prisma.$disconnect();
  process.exit(result.isComplete ? 0 : 2);
}

main().catch(async (err) => {
  logger.error({ error: err instanceof Error ? err.message : err }, "Evidence pack ingestion failed");
  console.error("FATAL:", err);
  await prisma.$disconnect();
  process.exit(1);
});
