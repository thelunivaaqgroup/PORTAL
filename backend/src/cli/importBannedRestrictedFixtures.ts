/**
 * CLI tool for importing banned/restricted evidence fixtures.
 *
 * Usage:
 *   pnpm banned:import-fixtures
 *   ACTOR_USER_ID=<userId> pnpm banned:import-fixtures
 *
 * Reads PDF/HTML/TXT files from fixtures/banned-restricted/ and imports them
 * as a BannedRestrictedSnapshot via the importArtifacts service.
 *
 * Files must be named with the linkType prefix:
 *   HUB-*.pdf
 *   ROTTERDAM_IMPORT-*.pdf
 *   ROTTERDAM_EXPORT-*.pdf
 *   MINAMATA-*.pdf
 *   POISONS_STANDARD-*.pdf
 *
 * Exit codes: 0 = success (chemicals extracted), 2 = no chemicals, 1 = fatal error
 */

import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { importArtifacts, KNOWN_SOURCE_URLS } from "../bannedRestricted/importArtifacts.js";
import type { BannedRestrictedLinkType } from "@prisma/client";

const FIXTURES_DIR = join(process.cwd(), "fixtures", "banned-restricted");

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "html":
    case "htm":
      return "text/html";
    case "txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

async function main() {
  logger.info("=== Banned/Restricted Fixture Import ===");

  // Resolve actor user
  const envUserId = process.env.ACTOR_USER_ID;
  let actorUserId: string;

  if (envUserId) {
    actorUserId = envUserId;
    logger.info({ userId: actorUserId }, "Using ACTOR_USER_ID from environment");
  } else {
    logger.info("No ACTOR_USER_ID set — looking up first SUPER_ADMIN");
    const admin = await prisma.user.findFirst({
      where: { role: "SUPER_ADMIN" },
      select: { id: true, email: true },
    });
    if (!admin) {
      logger.error("No SUPER_ADMIN user found in database");
      process.exit(1);
    }
    actorUserId = admin.id;
    logger.info({ userId: admin.id, email: admin.email }, "Using admin user");
  }

  // Read fixture files
  let entries: string[];
  try {
    entries = await readdir(FIXTURES_DIR);
  } catch {
    logger.error(
      { dir: FIXTURES_DIR },
      "Fixtures directory not found. Create it and add evidence PDFs named like HUB-page.pdf, ROTTERDAM_IMPORT-page.pdf, etc.",
    );
    process.exit(1);
  }

  const artifactFiles = entries.filter((f) =>
    f.match(/\.(pdf|html|htm|txt)$/i),
  );

  if (artifactFiles.length === 0) {
    logger.error(
      { dir: FIXTURES_DIR },
      "No PDF/HTML/TXT files found in fixtures directory.",
    );
    process.exit(1);
  }

  // Parse link types from filenames
  const artifacts = [];
  for (const filename of artifactFiles) {
    const dashIdx = filename.indexOf("-");
    if (dashIdx === -1) {
      logger.warn(
        { file: filename },
        "Skipping file — name must start with LINKTYPE- prefix (e.g. HUB-page.pdf)",
      );
      continue;
    }

    const prefix = filename.slice(0, dashIdx).toUpperCase();
    const sourceUrl = KNOWN_SOURCE_URLS[prefix];
    if (!sourceUrl) {
      logger.warn(
        { file: filename, prefix },
        `Skipping file — unknown linkType prefix "${prefix}". Valid: ${Object.keys(KNOWN_SOURCE_URLS).join(", ")}`,
      );
      continue;
    }

    const filePath = join(FIXTURES_DIR, filename);
    const fileStat = await stat(filePath);

    artifacts.push({
      linkType: prefix as BannedRestrictedLinkType,
      sourceUrl,
      filePath,
      originalName: filename,
      mimeType: getMimeType(filename),
      sizeBytes: fileStat.size,
    });
  }

  if (artifacts.length === 0) {
    logger.error("No valid fixture files to import after parsing.");
    process.exit(1);
  }

  logger.info(
    { files: artifacts.map((a) => `${a.linkType}: ${a.originalName}`) },
    "Importing fixture artifacts",
  );

  const startTime = Date.now();
  const result = await importArtifacts(actorUserId, artifacts);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n=== Import Result ===");
  console.log(`  Snapshot ID:      ${result.snapshotId}`);
  console.log(`  Sources Total:    ${result.sourcesTotal}`);
  console.log(`  Sources Success:  ${result.sourcesSuccess}`);
  console.log(`  Sources Failed:   ${result.sourcesFailed}`);
  console.log(`  Chemicals Found:  ${result.chemicalsCount}`);
  console.log(`  Is Complete:      ${result.isComplete}`);
  console.log(`  Duration:         ${elapsed}s`);
  console.log();

  await prisma.$disconnect();
  process.exit(result.isComplete ? 0 : 2);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
