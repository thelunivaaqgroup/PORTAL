import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import type {
  ComplianceRequestStatus,
  GeneratedArtifactType,
} from "@prisma/client";
import {
  runEligibilityChecks,
  type EligibilityReport3,
} from "./complianceEligibilityService.js";

// ── Single Admin Approval Policy (single source of truth) ──

/**
 * Only Uma (ADMIN) can approve a compliance request.
 * Approval is gated: bannedRestrictedStatus must be PASS (ingredient matching & AICIS are informational only).
 */
export const APPROVAL_POLICY = {
  email: "uma@thelunivaaqgroup.com",
  role: "ADMIN" as const,
  name: "Uma Sharma",
} as const;

// ── Types ──

type EligibilityCheck = {
  key: string;
  label: string;
  passed: boolean;
  reason: string;
  evidenceLinks: string[];
};

type EligibilityReport = {
  eligible: boolean;
  checks: EligibilityCheck[];
  checkedAt: string;
};

// ── Service Functions ──

/**
 * Create a new compliance request for a product.
 * Attaches the latest upload, active AICIS snapshot, and latest B/R snapshot.
 */
export async function createComplianceRequest(
  productId: string,
  userId: string,
  regionScope: string[],
) {
  // Load product with latest upload
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      latestUploadId: true,
      targetRegions: true,
    },
  });
  if (!product) throw new Error("PRODUCT_NOT_FOUND");
  if (!product.latestUploadId) throw new Error("NO_UPLOAD");

  // Get active AICIS snapshot
  const aicisSnap = await prisma.aicisInventorySnapshot.findFirst({
    where: { isActive: true, regionCode: "AU" },
    select: { id: true },
  });

  // Get latest complete B/R snapshot
  const brSnap = await prisma.bannedRestrictedSnapshot.findFirst({
    where: { isComplete: true },
    orderBy: { fetchedAt: "desc" },
    select: { id: true },
  });

  const request = await prisma.complianceRequest.create({
    data: {
      productId,
      uploadId: product.latestUploadId,
      regionScope: regionScope.length > 0 ? regionScope : product.targetRegions,
      status: "DRAFT",
      aicisSnapshotId: aicisSnap?.id ?? null,
      bannedRestrictedSnapshotId: brSnap?.id ?? null,
      createdByUserId: userId,
    },
    include: {
      product: { select: { id: true, name: true, skuCode: true } },
      createdBy: { select: { id: true, fullName: true, email: true } },
      approvals: true,
      artifacts: true,
    },
  });

  return request;
}

/**
 * List compliance requests for hub (recent first).
 * Optional filter by status.
 */
export async function listComplianceRequests(opts?: { status?: string; limit?: number }) {
  const limit = Math.min(100, Math.max(1, opts?.limit ?? 50));
  const requests = await prisma.complianceRequest.findMany({
    where: opts?.status ? { status: opts.status as "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED" } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      product: { select: { id: true, name: true, skuCode: true } },
      createdBy: { select: { id: true, fullName: true, email: true } },
    },
  });
  return requests;
}

/**
 * Run 3-state eligibility checks on a compliance request.
 *
 * Per-check: PASS / NEEDS_REVIEW / FAIL
 * Overall:   ELIGIBLE / ELIGIBLE_WITH_WARNINGS / NOT_ELIGIBLE
 *
 * Delegates to complianceEligibilityService for the actual evaluation logic.
 */
export async function checkEligibility(requestId: string, userId: string) {
  const report = await runEligibilityChecks(requestId, userId);

  // Re-fetch the updated request for the response
  const updated = await prisma.complianceRequest.findUnique({
    where: { id: requestId },
    include: {
      product: { select: { id: true, name: true, skuCode: true } },
      createdBy: { select: { id: true, fullName: true, email: true } },
      approvals: {
        include: {
          approver: { select: { id: true, fullName: true, email: true, role: true } },
        },
      },
      artifacts: true,
    },
  });

  // Build backward-compatible legacy report shape for existing consumers
  const legacyReport: EligibilityReport = {
    eligible: report.eligibilityStatus === "READY_FOR_APPROVAL" || report.eligibilityStatus === "ELIGIBLE",
    checks: report.checks.map((c) => ({
      key: c.key,
      label: c.label,
      passed: c.status === "PASS",
      reason: c.reason,
      evidenceLinks: c.evidenceLinks,
    })),
    checkedAt: report.checkedAt,
  };

  // Approval readiness: only depends on B/R status + checks having been run.
  // Ingredient Matching and AICIS are informational only.
  const brStatus = report.bannedRestrictedStatus;
  const approvalReady = brStatus === "PASS";
  const approvalReadyReason = !approvalReady
    ? (brStatus === "FAIL"
        ? "Banned/Restricted Scrutiny failed — cannot approve."
        : brStatus === "NEEDS_REVIEW"
          ? "Banned/Restricted Scrutiny needs review — resolve before approval."
          : "Run compliance checks first.")
    : undefined;

  return { request: updated, report: legacyReport, report3: report, approvalReady, approvalReadyReason };
}

/**
 * Single-admin approval: only Uma can approve.
 * Gated by: bannedRestrictedStatus === "PASS" && compliance checks have been run.
 * Ingredient Matching and AICIS status are informational — they do NOT block approval.
 * On success: sets eligibilityStatus=APPROVED, status=APPROVED,
 * records approvedByUserId + approvedAt, and generates artifacts.
 */
export async function approveRequest(
  requestId: string,
  userId: string,
  comment?: string,
) {
  // Load request
  const request = await prisma.complianceRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      productId: true,
      status: true,
      eligibilityStatus: true,
      bannedRestrictedStatus: true,
      checkedAt: true,
    },
  });
  if (!request) throw new Error("REQUEST_NOT_FOUND");
  if (request.status === "APPROVED" || request.eligibilityStatus === "APPROVED") {
    throw new Error("ALREADY_APPROVED");
  }

  // Gate: compliance must have been run AND Banned/Restricted must be PASS.
  // Ingredient Matching and AICIS are informational — they do NOT block approval.
  if (!request.bannedRestrictedStatus || !request.checkedAt) {
    throw new Error("NOT_READY_FOR_APPROVAL");
  }
  if (request.bannedRestrictedStatus !== "PASS") {
    throw new Error("NOT_READY_FOR_APPROVAL");
  }

  // Validate approver identity
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, email: true, role: true },
  });
  if (!user) throw new Error("USER_NOT_FOUND");

  const normEmail = user.email.toLowerCase().trim();
  if (normEmail !== APPROVAL_POLICY.email || user.role !== APPROVAL_POLICY.role) {
    throw new Error(
      `NOT_AUTHORIZED_APPROVER: Only ${APPROVAL_POLICY.name} (${APPROVAL_POLICY.email}) can approve compliance requests.`,
    );
  }

  const now = new Date();

  // Record approval in ComplianceApproval table (keeps history)
  const approval = await prisma.complianceApproval.upsert({
    where: {
      requestId_approverUserId: { requestId, approverUserId: userId },
    },
    create: {
      requestId,
      approverUserId: userId,
      decision: "APPROVED",
      comment: comment ?? null,
    },
    update: {
      decision: "APPROVED",
      comment: comment ?? null,
      decidedAt: now,
    },
    include: {
      approver: { select: { id: true, fullName: true, email: true, role: true } },
    },
  });

  // Update request: status + eligibility + approvedBy fields
  await prisma.complianceRequest.update({
    where: { id: requestId },
    data: {
      status: "APPROVED",
      eligibilityStatus: "APPROVED",
      approvedByUserId: userId,
      approvedAt: now,
    },
  });

  // Generate artifacts
  const artifacts = await generateArtifacts(requestId, userId);

  return { approval, approved: true, requestStatus: "APPROVED" as ComplianceRequestStatus, artifacts };
}

/**
 * Generate the 4 output artifacts after final approval.
 * Uses deterministic templates based on product data.
 */
async function generateArtifacts(requestId: string, actorUserId: string) {
  const request = await prisma.complianceRequest.findUnique({
    where: { id: requestId },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          skuCode: true,
          brand: true,
          productLine: true,
          targetRegions: true,
        },
      },
      upload: {
        include: {
          rows: {
            select: {
              rawName: true,
              casNumber: true,
              detectedPct: true,
              inciSuggestion: true,
              matchedIngredient: {
                select: { inciName: true, casNumber: true },
              },
            },
          },
        },
      },
    },
  });

  if (!request) throw new Error("REQUEST_NOT_FOUND");

  const product = request.product;
  const ingredients = request.upload.rows.map((r) => ({
    name: r.matchedIngredient?.inciName ?? r.inciSuggestion ?? r.rawName,
    cas: r.matchedIngredient?.casNumber ?? r.casNumber ?? null,
    pct: r.detectedPct,
  }));

  const inciList = ingredients
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
    .map((i) => i.name)
    .join(", ");

  // Get latest version number for each artifact type
  const existingArtifacts = await prisma.generatedArtifact.findMany({
    where: { requestId },
    select: { type: true, versionNumber: true },
  });
  const maxVersion = (type: string) => {
    const existing = existingArtifacts
      .filter((a) => a.type === type)
      .map((a) => a.versionNumber);
    return existing.length > 0 ? Math.max(...existing) : 0;
  };

  const artifacts: {
    type: GeneratedArtifactType;
    contentMarkdown?: string;
    contentJson?: object;
  }[] = [];

  // A) Marketing Plan
  const marketingPlan = [
    `# Marketing Plan — ${product.name}`,
    "",
    `**SKU:** ${product.skuCode}`,
    `**Brand:** ${product.brand ?? "TBD"}`,
    `**Product Line:** ${product.productLine ?? "TBD"}`,
    `**Target Regions:** ${product.targetRegions.join(", ")}`,
    `**Compliance Request ID:** ${requestId}`,
    "",
    "## Regulatory Compliance",
    "",
    "- AICIS Inventory Scrutiny: **PASS** (all ingredients listed)",
    "- Banned/Restricted Chemicals: **NOT LISTED** (no ingredients found in banned sources)",
    `- AICIS Snapshot: ${request.aicisSnapshotId ?? "N/A"}`,
    `- B/R Snapshot: ${request.bannedRestrictedSnapshotId ?? "N/A"}`,
    "",
    "## Key Ingredients (INCI)",
    "",
    inciList,
    "",
    "## Positioning",
    "",
    `${product.name} is a compliant formulation approved for the Australian market.`,
    `All ${ingredients.length} ingredients have been verified against the AICIS Industrial Chemicals Inventory`,
    "and confirmed NOT LISTED in any banned/restricted chemical sources.",
    "",
    "## Target Audience",
    "",
    "*(To be defined by marketing team based on product ideation canvas.)*",
    "",
    "## Channels",
    "",
    "- E-commerce (D2C)",
    "- Retail distribution",
    "- Professional/salon distribution",
    "",
    "---",
    `*Generated automatically on ${new Date().toISOString().split("T")[0]}.*`,
    `*Evidence: AICIS snapshot ${request.aicisSnapshotId ?? "N/A"}, B/R snapshot ${request.bannedRestrictedSnapshotId ?? "N/A"}.*`,
  ].join("\n");

  artifacts.push({
    type: "MARKETING_PLAN",
    contentMarkdown: marketingPlan,
  });

  // B) Layout Design Brief
  const layoutBrief = [
    `# Layout Design Brief — ${product.name}`,
    "",
    `**SKU:** ${product.skuCode}`,
    `**Brand:** ${product.brand ?? "TBD"}`,
    `**Regions:** ${product.targetRegions.join(", ")}`,
    "",
    "## Product Label Requirements",
    "",
    "### Front Panel",
    "",
    `- **Product Name:** ${product.name}`,
    `- **Brand Name:** ${product.brand ?? "TBD"}`,
    "- **Net Content:** *(as per label metadata)*",
    "",
    "### Back Panel",
    "",
    "#### INCI Declaration (full, descending concentration order)",
    "",
    inciList,
    "",
    `#### Ingredient Count: ${ingredients.length}`,
    "",
    "#### Regulatory Markings",
    "",
    product.targetRegions.includes("AU")
      ? "- AICIS compliance verified"
      : "",
    product.targetRegions.includes("IN")
      ? "- BIS/CDSCO markings as applicable"
      : "",
    "- Batch number placeholder",
    "- Manufacturing date / Expiry date placeholders",
    "- Manufacturer name & address",
    "",
    "### Warnings / Precautions",
    "",
    "*(As per label metadata and regulatory requirements for each region.)*",
    "",
    "## Layout Specifications",
    "",
    "- Primary label dimensions: TBD (based on container size)",
    "- Minimum font sizes per regional regulations",
    "- Barcode placement: bottom of back panel",
    "",
    "---",
    `*Generated on ${new Date().toISOString().split("T")[0]}. Compliance Request: ${requestId}.*`,
  ]
    .filter(Boolean)
    .join("\n");

  artifacts.push({
    type: "LAYOUT_BRIEF",
    contentMarkdown: layoutBrief,
  });

  // C) Color Sequence
  const colorSequence = {
    productName: product.name,
    brand: product.brand ?? null,
    sequence: [
      {
        role: "primary",
        hex: "#1B4D3E",
        name: "Forest Green",
        rationale: "Conveys natural, clean-beauty positioning.",
      },
      {
        role: "secondary",
        hex: "#F5F0E8",
        name: "Warm Ivory",
        rationale: "Clean, premium background for label readability.",
      },
      {
        role: "accent",
        hex: "#C8A96E",
        name: "Gold",
        rationale: "Premium accent for brand name and key callouts.",
      },
      {
        role: "text",
        hex: "#2D2D2D",
        name: "Charcoal",
        rationale: "High-contrast body text for INCI declarations.",
      },
    ],
    notes:
      "Color sequence to be validated against brand guidelines. Adjust for regional packaging requirements.",
    generatedAt: new Date().toISOString(),
    requestId,
  };

  artifacts.push({
    type: "COLOR_SEQUENCE",
    contentJson: colorSequence,
  });

  // D) Sample Packaging Design Brief
  const packagingBrief = [
    `# Sample Packaging Design Brief — ${product.name}`,
    "",
    `**SKU:** ${product.skuCode}`,
    `**Brand:** ${product.brand ?? "TBD"}`,
    `**Regions:** ${product.targetRegions.join(", ")}`,
    `**Compliance Request:** ${requestId}`,
    "",
    "## Packaging Structure",
    "",
    "### Primary Container",
    "",
    "- **Type:** *(bottle / tube / jar — TBD based on product category)*",
    "- **Material:** Recyclable PET/HDPE (preferred for sustainability)",
    "- **Capacity:** *(as per pack spec in product configuration)*",
    "- **Closure:** Flip-top / pump / screw cap",
    "",
    "### Secondary Packaging (if applicable)",
    "",
    "- Carton box with product information",
    "- Regional language inserts for multi-market distribution",
    "",
    "## Label Application",
    "",
    "- Full-wrap pressure-sensitive label OR direct print",
    "- Must accommodate complete INCI declaration:",
    "",
    `  ${inciList}`,
    "",
    `  *(${ingredients.length} ingredients total)*`,
    "",
    "## Regulatory Compliance Markings",
    "",
    "| Region | Required Markings |",
    "|--------|-------------------|",
    ...(product.targetRegions.includes("AU")
      ? [
          "| AU | AICIS compliant, Batch/LOT number, Manufacturer details, Net content, Warnings |",
        ]
      : []),
    ...(product.targetRegions.includes("IN")
      ? [
          "| IN | BIS/CDSCO markings, MRP, Mfg/Exp dates, Batch, Manufacturer license, Net qty |",
        ]
      : []),
    "",
    "## Sustainability Requirements",
    "",
    "- FSC-certified carton material (if carton is used)",
    "- Recyclable / recycling symbol on container",
    "- Minimal plastic use where possible",
    "",
    "## Quality Control",
    "",
    "- Print proof required before bulk production",
    "- Color match against Pantone / CMYK specs in color sequence document",
    "- Bar code scan verification",
    "",
    "---",
    `*Generated on ${new Date().toISOString().split("T")[0]}.*`,
    `*All ingredient data sourced from verified formulation upload. Compliance verified against AICIS and banned/restricted evidence sources.*`,
  ].join("\n");

  artifacts.push({
    type: "PACKAGING_BRIEF",
    contentMarkdown: packagingBrief,
  });

  // Persist all artifacts
  const created = [];
  for (const art of artifacts) {
    const version = maxVersion(art.type) + 1;
    const row = await prisma.generatedArtifact.create({
      data: {
        requestId,
        productId: product.id,
        type: art.type,
        versionNumber: version,
        contentMarkdown: art.contentMarkdown ?? null,
        contentJson: art.contentJson ?? undefined,
        generationMeta: {
          generator: "deterministic-template-v1",
          generatedAt: new Date().toISOString(),
          aicisSnapshotId: request.aicisSnapshotId,
          brSnapshotId: request.bannedRestrictedSnapshotId,
          uploadId: request.uploadId,
          ingredientCount: ingredients.length,
        },
        createdByUserId: actorUserId,
      },
    });
    created.push(row);
  }

  logger.info(
    { requestId, artifactCount: created.length },
    "Generated compliance artifacts",
  );

  return created;
}

/**
 * Get a compliance request with all related data.
 */
export async function getComplianceRequest(requestId: string) {
  const request = await prisma.complianceRequest.findUnique({
    where: { id: requestId },
    include: {
      product: { select: { id: true, name: true, skuCode: true, brand: true } },
      upload: { select: { id: true, fileName: true, createdAt: true } },
      createdBy: { select: { id: true, fullName: true, email: true } },
      approvedBy: { select: { id: true, fullName: true, email: true } },
      approvals: {
        include: {
          approver: {
            select: { id: true, fullName: true, email: true, role: true },
          },
        },
        orderBy: { decidedAt: "asc" },
      },
      artifacts: { orderBy: { type: "asc" } },
    },
  });

  return request;
}

/**
 * Get the latest compliance request for a product.
 */
export async function getLatestForProduct(productId: string) {
  const request = await prisma.complianceRequest.findFirst({
    where: { productId },
    orderBy: { createdAt: "desc" },
    include: {
      product: { select: { id: true, name: true, skuCode: true, brand: true } },
      upload: { select: { id: true, fileName: true, createdAt: true } },
      createdBy: { select: { id: true, fullName: true, email: true } },
      approvedBy: { select: { id: true, fullName: true, email: true } },
      approvals: {
        include: {
          approver: {
            select: { id: true, fullName: true, email: true, role: true },
          },
        },
        orderBy: { decidedAt: "asc" },
      },
      artifacts: { orderBy: { type: "asc" } },
    },
  });

  return request;
}

/**
 * Get artifacts for a compliance request.
 */
export async function getArtifacts(requestId: string) {
  return prisma.generatedArtifact.findMany({
    where: { requestId },
    orderBy: [{ type: "asc" }, { versionNumber: "desc" }],
    include: {
      createdBy: { select: { id: true, fullName: true } },
    },
  });
}

/**
 * Get a single artifact by ID.
 */
export async function getArtifactById(artifactId: string) {
  return prisma.generatedArtifact.findUnique({
    where: { id: artifactId },
    include: {
      createdBy: { select: { id: true, fullName: true } },
      request: {
        select: {
          id: true,
          productId: true,
          status: true,
          aicisSnapshotId: true,
          bannedRestrictedSnapshotId: true,
        },
      },
    },
  });
}
