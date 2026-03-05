/**
 * CLI entry point for running banned/restricted sync as a standalone worker.
 *
 * Usage:
 *   pnpm banned:sync
 *   ACTOR_USER_ID=<userId> pnpm banned:sync
 *
 * Environment:
 *   DATABASE_URL   — required (Prisma connection string)
 *   ACTOR_USER_ID  — optional, defaults to first SUPER_ADMIN user
 *
 * This command:
 *   1. Connects to the database
 *   2. Resolves the actor user (for audit trail)
 *   3. Runs syncBannedRestricted (Playwright-based)
 *   4. Prints the result and exits
 *
 * Designed to be run from any environment — local dev, EC2, ECS Fargate, cron.
 */
import "dotenv/config";
import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import { syncBannedRestricted } from "../bannedRestricted/syncBannedRestricted.js";

async function main(): Promise<void> {
  logger.info("=== Banned/Restricted Sync Worker ===");

  // Resolve actor user
  let actorUserId = process.env.ACTOR_USER_ID;

  if (!actorUserId) {
    logger.info("No ACTOR_USER_ID set — looking up first SUPER_ADMIN");
    const admin = await prisma.user.findFirst({
      where: { role: "SUPER_ADMIN", isActive: true },
      select: { id: true, email: true },
    });
    if (!admin) {
      logger.error("No active SUPER_ADMIN user found. Set ACTOR_USER_ID env var.");
      process.exit(1);
    }
    actorUserId = admin.id;
    logger.info({ userId: actorUserId, email: admin.email }, "Using admin user");
  }

  // Run sync
  const startMs = Date.now();
  const result = await syncBannedRestricted(actorUserId);
  const durationSec = ((Date.now() - startMs) / 1000).toFixed(1);

  // Print result
  console.log("");
  console.log("=== Sync Result ===");
  console.log(`  Snapshot ID:      ${result.snapshotId}`);
  console.log(`  Sources Total:    ${result.sourcesTotal}`);
  console.log(`  Sources Success:  ${result.sourcesSuccess}`);
  console.log(`  Sources Failed:   ${result.sourcesFailed}`);
  console.log(`  Chemicals Found:  ${result.chemicalsCount}`);
  console.log(`  Is Complete:      ${result.isComplete}`);
  console.log(`  Duration:         ${durationSec}s`);
  console.log("");

  if (!result.isComplete) {
    console.log("WARNING: Snapshot is INCOMPLETE.");
    console.log("  Sources were unreachable from this environment.");
    console.log("  No compliance conclusions can be made.");
    console.log("  Retry from a server with access to industrialchemicals.gov.au.");
    console.log("");
  }

  await prisma.$disconnect();
  process.exit(result.isComplete ? 0 : 2);
}

main().catch(async (err) => {
  logger.error({ error: err instanceof Error ? err.message : err }, "Sync worker failed");
  console.error("FATAL:", err);
  await prisma.$disconnect();
  process.exit(1);
});
