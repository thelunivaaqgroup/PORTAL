/**
 * backfillApprovers.ts
 *
 * Migrates all existing compliance requests to the single-admin approval policy:
 *   Uma Sharma (ADMIN, uma@thelunivaaqgroup.com) is the sole approver.
 *
 * What it does:
 *  - Deletes any ComplianceApproval rows from users other than Uma.
 *  - If a request was APPROVED but Uma's approval is missing, reverts to
 *    IN_REVIEW and clears approvedByUserId/approvedAt.
 *  - Updates old eligibilityStatus values: ELIGIBLE → READY_FOR_APPROVAL.
 *  - Writes an AuditLog entry for every request touched.
 *
 * Usage:  pnpm approvers:backfill
 */

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();

const SOLE_APPROVER = { email: "uma@thelunivaaqgroup.com", role: "ADMIN" };

function isSoleApprover(email: string, role: string): boolean {
  return email.toLowerCase().trim() === SOLE_APPROVER.email && role === SOLE_APPROVER.role;
}

async function main() {
  console.log("=== Single-Admin Approval Backfill ===");
  console.log(`Sole approver: ${SOLE_APPROVER.email} (${SOLE_APPROVER.role})\n`);

  const requests = await prisma.complianceRequest.findMany({
    include: {
      approvals: {
        include: {
          approver: { select: { id: true, fullName: true, email: true, role: true } },
        },
      },
    },
  });

  console.log(`Found ${requests.length} compliance request(s) to process.\n`);

  let totalModified = 0;
  let totalApprovalsDeleted = 0;
  let totalStatusReverted = 0;
  let totalEligibilityFixed = 0;

  for (const req of requests) {
    const before = {
      status: req.status,
      eligibilityStatus: req.eligibilityStatus,
      approvedByUserId: req.approvedByUserId,
      approvals: req.approvals.map((a) => ({
        id: a.id,
        email: a.approver.email,
        fullName: a.approver.fullName,
        role: a.approver.role,
        decision: a.decision,
      })),
    };

    // Identify approvals to delete (not Uma)
    const toDelete = req.approvals.filter(
      (a) => !isSoleApprover(a.approver.email, a.approver.role),
    );

    // Check if Uma's approval exists
    const umaApproval = req.approvals.find(
      (a) => isSoleApprover(a.approver.email, a.approver.role) && a.decision === "APPROVED",
    );

    // Fix eligibilityStatus: old ELIGIBLE → READY_FOR_APPROVAL
    let newEligibilityStatus = req.eligibilityStatus;
    if (req.eligibilityStatus === "ELIGIBLE") {
      newEligibilityStatus = "READY_FOR_APPROVAL";
      totalEligibilityFixed++;
    }

    // Fix request status
    let newStatus = req.status;
    let clearApprover = false;

    if (req.status === "APPROVED" && !umaApproval) {
      // Was approved under old multi-approver policy but Uma didn't approve
      newStatus = "IN_REVIEW";
      newEligibilityStatus = "READY_FOR_APPROVAL";
      clearApprover = true;
      totalStatusReverted++;
    }

    // Skip if nothing to change
    if (
      toDelete.length === 0 &&
      newStatus === req.status &&
      newEligibilityStatus === req.eligibilityStatus &&
      !clearApprover
    ) {
      continue;
    }

    totalModified++;

    // Delete non-Uma approvals
    if (toDelete.length > 0) {
      await prisma.complianceApproval.deleteMany({
        where: { id: { in: toDelete.map((a) => a.id) } },
      });
      totalApprovalsDeleted += toDelete.length;
      console.log(
        `  [${req.id}] Deleted ${toDelete.length} non-Uma approval(s): ${toDelete.map((a) => a.approver.email).join(", ")}`,
      );
    }

    // Update request
    const updateData: Record<string, unknown> = {};
    if (newStatus !== req.status) {
      updateData.status = newStatus;
      console.log(`  [${req.id}] Status: ${req.status} -> ${newStatus}`);
    }
    if (newEligibilityStatus !== req.eligibilityStatus) {
      updateData.eligibilityStatus = newEligibilityStatus;
      console.log(`  [${req.id}] EligibilityStatus: ${req.eligibilityStatus} -> ${newEligibilityStatus}`);
    }
    if (clearApprover) {
      updateData.approvedByUserId = null;
      updateData.approvedAt = null;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.complianceRequest.update({
        where: { id: req.id },
        data: updateData,
      });
    }

    // Write audit log
    await prisma.auditLog.create({
      data: {
        id: crypto.randomUUID(),
        action: "APPROVER_POLICY_BACKFILLED",
        entityType: "compliance_request",
        entityId: req.id,
        metadata: {
          before,
          after: {
            status: newStatus,
            eligibilityStatus: newEligibilityStatus,
            approvedByUserId: clearApprover ? null : req.approvedByUserId,
          },
          policy: SOLE_APPROVER,
        },
      },
    });
  }

  console.log("\n=== Summary ===");
  console.log(`Requests processed:       ${requests.length}`);
  console.log(`Requests modified:        ${totalModified}`);
  console.log(`Approvals deleted:        ${totalApprovalsDeleted}`);
  console.log(`Statuses reverted:        ${totalStatusReverted}`);
  console.log(`Eligibility status fixed: ${totalEligibilityFixed}`);
  console.log("\nDone.");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
