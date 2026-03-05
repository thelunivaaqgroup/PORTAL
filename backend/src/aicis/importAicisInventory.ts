/**
 * CLI script to import the real AICIS Inventory from an Excel file.
 *
 * Usage:
 *   npx tsx src/aicis/importAicisInventory.ts "/path/to/Full list of chemicals on the Inventory - 9 January 2026 -V8.xlsx"
 *
 * What it does:
 *   1. Deletes all existing AICIS scrutiny findings, scrutiny snapshots, chemicals, and inventory snapshots
 *   2. Reads the Excel file into a buffer
 *   3. Calls the existing importAicisInventoryFromBuffer() to parse, normalize, and bulk-insert
 *   4. Logs summary
 */
import { readFileSync } from "node:fs";
import { prisma } from "../prisma.js";
import { importAicisInventoryFromBuffer } from "./aicis.importer.js";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npx tsx src/aicis/importAicisInventory.ts <path-to-xlsx>");
    process.exit(1);
  }

  console.log(`Reading file: ${filePath}`);
  const fileBuffer = readFileSync(filePath);
  console.log(`File size: ${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  // ── 1. Get the SUPER_ADMIN user id (needed for importedByUserId) ──
  const admin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
    select: { id: true, email: true },
  });
  if (!admin) {
    console.error("No SUPER_ADMIN user found in database.");
    process.exit(1);
  }
  console.log(`Using actor: ${admin.email} (${admin.id})`);

  // ── 2. Clear existing AICIS data (order matters: FK constraints) ──
  console.log("\nClearing existing AICIS data...");

  const findingsDeleted = await prisma.uploadAicisScrutinyRowFinding.deleteMany({});
  console.log(`  Deleted ${findingsDeleted.count} scrutiny row findings`);

  const scrutiniesDeleted = await prisma.uploadAicisScrutinySnapshot.deleteMany({});
  console.log(`  Deleted ${scrutiniesDeleted.count} scrutiny snapshots`);

  const chemicalsDeleted = await prisma.aicisInventoryChemical.deleteMany({});
  console.log(`  Deleted ${chemicalsDeleted.count} chemicals`);

  const snapshotsDeleted = await prisma.aicisInventorySnapshot.deleteMany({});
  console.log(`  Deleted ${snapshotsDeleted.count} inventory snapshots`);

  // ── 3. Import real inventory ──
  const filename = filePath.split("/").pop() ?? "unknown.xlsx";
  console.log(`\nImporting: ${filename}`);
  console.log("This may take a minute for ~40k rows...\n");

  const startMs = Date.now();
  const result = await importAicisInventoryFromBuffer({
    regionCode: "AU",
    versionName: "Full AICIS Inventory V8 - 9 January 2026",
    fileBuffer,
    originalFilename: filename,
    actorUserId: admin.id,
    notes: "Full 40k chemical inventory import from official AICIS Excel download",
  });
  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);

  // ── 4. Verify ──
  const verifyCount = await prisma.aicisInventoryChemical.count({
    where: { snapshotId: result.snapshotId },
  });

  const snapshot = await prisma.aicisInventorySnapshot.findUnique({
    where: { id: result.snapshotId },
    select: { id: true, versionName: true, isActive: true, rowCount: true },
  });

  console.log("=== IMPORT COMPLETE ===");
  console.log(`  Snapshot ID:   ${result.snapshotId}`);
  console.log(`  Version:       ${result.versionName}`);
  console.log(`  Region:        ${result.regionCode}`);
  console.log(`  Rows imported: ${result.rowCount}`);
  console.log(`  DB verified:   ${verifyCount} chemicals`);
  console.log(`  Is active:     ${snapshot?.isActive}`);
  console.log(`  SHA256:        ${result.fileSha256}`);
  console.log(`  Time:          ${elapsedSec}s`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Import failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
