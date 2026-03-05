import { prisma } from "../prisma.js";
import { logger } from "../logger.js";

// ── Types ──

type ComplianceIssue =
  | { type: "NO_RULESET_DEFINED"; region: string }
  | { type: "UNMATCHED"; ingredient: string }
  | { type: "BANNED"; ingredient: string; ingredientId: string }
  | { type: "RESTRICTED_EXCEEDED"; ingredient: string; ingredientId: string; max: number; actual: number }
  | { type: "RESTRICTED_WITHIN_LIMIT"; ingredient: string; ingredientId: string; max: number | null; actual: number | null };

type SnapshotStatus = "PASS" | "WARN" | "FAIL";

/**
 * Run compliance checks for an upload against one or more regions.
 * Creates an UploadComplianceSnapshot per region.
 */
export async function runComplianceForUpload(
  uploadId: string,
  regions: string[],
) {
  // 1) Fetch upload rows with matched ingredient + detectedPct
  const upload = await prisma.formulationUpload.findUnique({
    where: { id: uploadId },
    include: {
      rows: {
        include: {
          matchedIngredient: { select: { id: true, inciName: true } },
        },
      },
    },
  });

  if (!upload) {
    logger.warn({ uploadId }, "compliance: upload not found");
    return;
  }

  const snapshots: { region: string; status: SnapshotStatus; issues: ComplianceIssue[] }[] = [];

  for (const region of regions) {
    const issues: ComplianceIssue[] = [];

    // 2) Fetch latest RuleSet for this region
    const ruleSet = await prisma.ruleSet.findFirst({
      where: { region },
      orderBy: { effectiveAt: "desc" },
      include: { items: true },
    });

    if (!ruleSet) {
      issues.push({ type: "NO_RULESET_DEFINED", region });
      snapshots.push({ region, status: "WARN", issues });
      continue;
    }

    // Build lookup: ingredientId → RuleItem
    const ruleMap = new Map<string, typeof ruleSet.items[number]>();
    for (const item of ruleSet.items) {
      ruleMap.set(item.ingredientId, item);
    }

    // 3) Check each row
    for (const row of upload.rows) {
      if (!row.matchedIngredientId || !row.matchedIngredient) {
        issues.push({ type: "UNMATCHED", ingredient: row.rawName });
        continue;
      }

      const rule = ruleMap.get(row.matchedIngredientId);
      if (!rule) {
        // No rule for this ingredient → treated as ALLOWED
        continue;
      }

      const ingredientName = row.matchedIngredient.inciName;

      if (rule.status === "BANNED") {
        issues.push({
          type: "BANNED",
          ingredient: ingredientName,
          ingredientId: row.matchedIngredientId,
        });
      } else if (rule.status === "RESTRICTED") {
        if (rule.maxPercent != null && row.detectedPct != null && row.detectedPct > rule.maxPercent) {
          issues.push({
            type: "RESTRICTED_EXCEEDED",
            ingredient: ingredientName,
            ingredientId: row.matchedIngredientId,
            max: rule.maxPercent,
            actual: row.detectedPct,
          });
        } else {
          issues.push({
            type: "RESTRICTED_WITHIN_LIMIT",
            ingredient: ingredientName,
            ingredientId: row.matchedIngredientId,
            max: rule.maxPercent ?? null,
            actual: row.detectedPct ?? null,
          });
        }
      }
      // ALLOWED → no issue
    }

    // 4) Compute overall status
    let status: SnapshotStatus = "PASS";
    const hasFail = issues.some(
      (i) => i.type === "BANNED" || i.type === "RESTRICTED_EXCEEDED",
    );
    const hasWarn = issues.some(
      (i) => i.type === "UNMATCHED" || i.type === "RESTRICTED_WITHIN_LIMIT",
    );

    if (hasFail) {
      status = "FAIL";
    } else if (hasWarn) {
      status = "WARN";
    }

    snapshots.push({ region, status, issues });
  }

  // 5) Persist snapshots
  for (const snap of snapshots) {
    await prisma.uploadComplianceSnapshot.create({
      data: {
        uploadId,
        region: snap.region,
        status: snap.status,
        issuesJson: snap.issues as object[],
      },
    });
  }

  logger.info({
    event: "compliance_check_complete",
    uploadId,
    regions,
    results: snapshots.map((s) => ({
      region: s.region,
      status: s.status,
      issueCount: s.issues.length,
    })),
  });

  return snapshots;
}
