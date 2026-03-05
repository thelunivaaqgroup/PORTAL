#!/usr/bin/env tsx
/**
 * CLI: Ingest offline evidence PDFs for Banned/Restricted scrutiny.
 *
 * Usage:
 *   pnpm banned:ingest:offline --snapshotName AU_BR_2026_03_01 --files a.pdf b.pdf
 *   pnpm banned:ingest:offline --snapshotName AU_BR_2026_03_01 --files *.pdf --createdByEmail admin@example.com
 *
 * Args:
 *   --snapshotName <name>      Required. Snapshot label (e.g., AU_BR_2026_03_01).
 *   --files <path...>          Required. One or more PDF/HTML/TXT file paths.
 *   --createdByEmail <email>   Optional. Admin email. Defaults to first SUPER_ADMIN.
 */

import { prisma } from "../prisma.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { ingestEvidencePack, type EvidencePackFile } from "../bannedRestricted/ingestEvidencePack.js";
import type { BannedRestrictedLinkType } from "@prisma/client";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";

// ── Arg parsing ──

function parseArgs(): { snapshotName: string; files: string[]; createdByEmail: string | null } {
  const args = process.argv.slice(2);
  let snapshotName: string | null = null;
  const files: string[] = [];
  let createdByEmail: string | null = null;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--snapshotName" && i + 1 < args.length) {
      snapshotName = args[++i];
    } else if (arg === "--files") {
      // Consume all remaining args that don't start with --
      i++;
      while (i < args.length && !args[i].startsWith("--")) {
        files.push(args[i]);
        i++;
      }
      continue; // don't increment i again
    } else if (arg === "--createdByEmail" && i + 1 < args.length) {
      createdByEmail = args[++i];
    } else if (!arg.startsWith("--")) {
      // Treat bare args as files (for glob expansion)
      files.push(arg);
    }
    i++;
  }

  if (!snapshotName) {
    console.error("ERROR: --snapshotName is required.");
    printUsage();
    process.exit(1);
  }
  if (files.length === 0) {
    console.error("ERROR: --files requires at least one file path.");
    printUsage();
    process.exit(1);
  }

  return { snapshotName, files, createdByEmail };
}

function printUsage() {
  console.log(`
Usage:
  pnpm banned:ingest:offline --snapshotName <name> --files <file1.pdf> [file2.pdf ...]

Required:
  --snapshotName <name>      Snapshot label (e.g., AU_BR_2026_03_01).
  --files <paths...>         One or more PDF file paths.

Optional:
  --createdByEmail <email>   Admin email for audit. Defaults to first SUPER_ADMIN.

Link type is auto-inferred from filename keywords:
  - "poisons" / "susmp"              → POISONS_STANDARD
  - "rotterdam" + "import"           → ROTTERDAM_IMPORT
  - "rotterdam" + "export"           → ROTTERDAM_EXPORT
  - "rotterdam"                      → ROTTERDAM_IMPORT
  - "minamata" / "mercury"           → MINAMATA
  - "stockholm" / "pop"              → STOCKHOLM_POP
  - "banned" / "restricted" / "aicis"→ HUB
  - otherwise                        → OTHER

Examples:
  pnpm banned:ingest:offline --snapshotName AU_BR_2026_03_01 --files evidence/hub-page.pdf evidence/poisons-standard.pdf
  pnpm banned:ingest:offline --snapshotName AU_BR_2026_03_01 --files evidence/*.pdf --createdByEmail chetan@company.com
`);
}

/** Infer BannedRestrictedLinkType from filename keywords */
function inferLinkType(filename: string): BannedRestrictedLinkType {
  const lower = filename.toLowerCase();

  // Check prefix convention: MINAMATA-mercury.pdf
  const dashIdx = filename.indexOf("-");
  if (dashIdx > 0) {
    const prefix = filename.slice(0, dashIdx).toUpperCase();
    const map: Record<string, BannedRestrictedLinkType> = {
      HUB: "HUB", ROTTERDAM_IMPORT: "ROTTERDAM_IMPORT", ROTTERDAM_EXPORT: "ROTTERDAM_EXPORT",
      MINAMATA: "MINAMATA", STOCKHOLM: "STOCKHOLM", STOCKHOLM_POP: "STOCKHOLM_POP",
      POISONS_STANDARD: "POISONS_STANDARD", OTHER: "OTHER",
    };
    if (map[prefix]) return map[prefix];
  }

  if (lower.includes("poisons") || lower.includes("susmp") || lower.includes("therapeutic")) return "POISONS_STANDARD";
  if (lower.includes("rotterdam") && lower.includes("import")) return "ROTTERDAM_IMPORT";
  if (lower.includes("rotterdam") && lower.includes("export")) return "ROTTERDAM_EXPORT";
  if (lower.includes("rotterdam")) return "ROTTERDAM_IMPORT";
  if (lower.includes("minamata") || lower.includes("mercury")) return "MINAMATA";
  if (lower.includes("stockholm") || lower.includes("pop")) return "STOCKHOLM_POP";
  if (lower.includes("banned") || lower.includes("restricted") || lower.includes("aicis")) return "HUB";
  return "OTHER";
}

// ── Main ──

async function main() {
  const { snapshotName, files, createdByEmail } = parseArgs();

  // Resolve actor user
  let actorUserId: string;
  if (createdByEmail) {
    const user = await prisma.user.findUnique({
      where: { email: createdByEmail },
      select: { id: true, fullName: true, role: true },
    });
    if (!user) {
      console.error(`ERROR: No user found with email "${createdByEmail}".`);
      process.exit(1);
    }
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      console.error(`ERROR: User "${user.fullName}" has role ${user.role}. Only SUPER_ADMIN/ADMIN allowed.`);
      process.exit(1);
    }
    actorUserId = user.id;
    console.log(`Actor: ${user.fullName} (${createdByEmail})`);
  } else {
    const admin = await prisma.user.findFirst({
      where: { role: "SUPER_ADMIN", isActive: true },
      select: { id: true, fullName: true, email: true },
    });
    if (!admin) {
      console.error("ERROR: No active SUPER_ADMIN found. Use --createdByEmail.");
      process.exit(1);
    }
    actorUserId = admin.id;
    console.log(`Actor: ${admin.fullName} (${admin.email}) [default SUPER_ADMIN]`);
  }

  // Validate files exist
  const packFiles: EvidencePackFile[] = [];
  for (const filePath of files) {
    const resolved = resolve(filePath);
    try {
      const s = await stat(resolved);
      if (!s.isFile()) {
        console.error(`ERROR: "${resolved}" is not a file.`);
        process.exit(1);
      }
    } catch {
      console.error(`ERROR: File not found: "${resolved}"`);
      process.exit(1);
    }

    const linkType = inferLinkType(filePath);
    packFiles.push({ linkType, filePath: resolved, originalName: filePath.split("/").pop() });
    console.log(`  ${linkType.padEnd(20)} ${resolved}`);
  }

  console.log(`\nIngesting ${packFiles.length} file(s) as snapshot "${snapshotName}"...\n`);

  // Run ingestion
  const result = await ingestEvidencePack(actorUserId, packFiles, snapshotName);

  // Write audit log
  await writeAuditLog({
    actorUserId,
    action: "BANNED_RESTRICTED_OFFLINE_INGESTED",
    entityType: "banned_restricted_snapshot",
    entityId: result.snapshotId,
    requestId: `cli-ingest-${Date.now()}`,
    metadata: {
      snapshotName,
      filesCount: packFiles.length,
      fileNames: packFiles.map((f) => f.originalName ?? f.filePath),
      sourcesTotal: result.sourcesTotal,
      sourcesSuccess: result.sourcesSuccess,
      sourcesFailed: result.sourcesFailed,
      chemicalsCount: result.chemicalsCount,
      poisonsNameOnlyCount: result.poisonsNameOnlyCount,
      isComplete: result.isComplete,
    },
  });

  // Print summary
  console.log("=".repeat(60));
  console.log("INGESTION COMPLETE");
  console.log("=".repeat(60));
  console.log(`  Snapshot ID:      ${result.snapshotId}`);
  console.log(`  Snapshot Name:    ${snapshotName}`);
  console.log(`  Complete:         ${result.isComplete ? "YES" : "NO"}`);
  console.log(`  Sources:          ${result.sourcesSuccess}/${result.sourcesTotal} succeeded`);
  console.log(`  CAS Chemicals:    ${result.chemicalsCount - result.poisonsNameOnlyCount}`);
  console.log(`  Name-Only (SUSMP):${result.poisonsNameOnlyCount}`);
  console.log(`  Total Indexed:    ${result.chemicalsCount}`);
  console.log();

  if (result.fileDetails.length > 0) {
    console.log("Per-file details:");
    for (const fd of result.fileDetails) {
      const status = fd.status === "SUCCESS" ? "OK" : "FAIL";
      console.log(`  [${status}] ${fd.linkType.padEnd(20)} ${fd.fileName} → ${fd.casCount} CAS, ${fd.nameOnlyCount} name-only`);
      if (fd.error) console.log(`         Error: ${fd.error.slice(0, 120)}`);
    }
  }

  if (!result.isComplete) {
    console.log("\nWARNING: Snapshot is NOT COMPLETE. At least 1 successful source with indexed chemicals required.");
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
