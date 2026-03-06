import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { logger } from "../logger.js";
import {
  createComplianceRequest,
  checkEligibility,
  approveRequest,
  getComplianceRequest,
  getLatestForProduct,
  listComplianceRequests,
  getArtifacts,
  getArtifactById,
  APPROVAL_POLICY,
} from "./complianceRequests.service.js";
import { buildComplianceReportData } from "./complianceReport.service.js";
import { generateExcelReport } from "./complianceReport.excel.js";
import { generatePdfReport } from "./complianceReport.pdf.js";
import { generateArtifactPdf, generateArtifactDocx } from "./artifactExport.service.js";

export const complianceRequestsRouter = Router();

complianceRequestsRouter.use(requireAuth);

// ──────────────────────────────────────────────────────────────
// POST /products/:productId/compliance-requests
// Create a new compliance request for the product's latest upload.
// ──────────────────────────────────────────────────────────────
complianceRequestsRouter.post(
  "/products/:productId/compliance-requests",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const productId = req.params.productId as string;
    const { regionScope } = req.body as { regionScope?: string[] };

    try {
      const request = await createComplianceRequest(
        productId,
        req.auth!.userId,
        regionScope ?? [],
      );

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "COMPLIANCE_REQUEST_CREATED",
        entityType: "compliance_request",
        entityId: request.id,
        requestId: req.requestId,
        ip: (Array.isArray(req.ip) ? req.ip[0] : req.ip) ?? undefined,
        userAgent: Array.isArray(req.headers["user-agent"]) ? req.headers["user-agent"][0] : req.headers["user-agent"],
        metadata: {
          productId,
          uploadId: request.uploadId,
          regionScope: request.regionScope,
          aicisSnapshotId: request.aicisSnapshotId,
          bannedRestrictedSnapshotId: request.bannedRestrictedSnapshotId,
        },
      });

      res.status(201).json({ request });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "PRODUCT_NOT_FOUND") {
        res.status(404).json({ code: "PRODUCT_NOT_FOUND", message: "Product not found" });
        return;
      }
      if (msg === "NO_UPLOAD") {
        res.status(400).json({
          code: "NO_UPLOAD",
          message: "Product has no formulation upload. Upload a formulation first.",
        });
        return;
      }
      throw err;
    }
  },
);

// ──────────────────────────────────────────────────────────────
// GET /products/:productId/compliance-requests/latest
// Get the latest compliance request for a product.
// ──────────────────────────────────────────────────────────────
complianceRequestsRouter.get(
  "/products/:productId/compliance-requests/latest",
  async (req, res) => {
    const productId = req.params.productId as string;
    const request = await getLatestForProduct(productId);
    if (!request) {
      res.status(404).json({
        code: "NOT_FOUND",
        message: "No compliance request found for this product.",
      });
      return;
    }
    res.json({ request });
  },
);

// ──────────────────────────────────────────────────────────────
// GET /compliance-requests
// List compliance requests (for Compliance hub).
// Query: status?, limit?
// ──────────────────────────────────────────────────────────────
complianceRequestsRouter.get(
  "/compliance-requests",
  async (req, res) => {
    const status = req.query.status as string | undefined;
    const limitRaw = req.query.limit as string | undefined;
    const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
    const requests = await listComplianceRequests({ status, limit });
    res.json({ requests });
  },
);

// ──────────────────────────────────────────────────────────────
// GET /compliance-requests/approval-policy
// Get the single-admin approval policy (for frontend display).
// MUST be registered before /:id to avoid being caught by param.
// ──────────────────────────────────────────────────────────────
complianceRequestsRouter.get(
  "/compliance-requests/approval-policy",
  async (_req, res) => {
    res.json({ policy: APPROVAL_POLICY });
  },
);

// ──────────────────────────────────────────────────────────────
// GET /compliance-requests/:id
// Get a specific compliance request by ID.
// ──────────────────────────────────────────────────────────────
complianceRequestsRouter.get(
  "/compliance-requests/:id",
  async (req, res) => {
    const request = await getComplianceRequest((req.params.id as string));
    if (!request) {
      res.status(404).json({ code: "NOT_FOUND", message: "Compliance request not found" });
      return;
    }
    res.json({ request });
  },
);

// ──────────────────────────────────────────────────────────────
// POST /compliance-requests/:id/check-eligibility
// Run eligibility checks on the compliance request.
// ──────────────────────────────────────────────────────────────
complianceRequestsRouter.post(
  "/compliance-requests/:id/check-eligibility",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      const result = await checkEligibility((req.params.id as string), req.auth!.userId);

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "COMPLIANCE_ELIGIBILITY_CHECKED",
        entityType: "compliance_request",
        entityId: (req.params.id as string),
        requestId: req.requestId,
        ip: (Array.isArray(req.ip) ? req.ip[0] : req.ip) ?? undefined,
        userAgent: Array.isArray(req.headers["user-agent"]) ? req.headers["user-agent"][0] : req.headers["user-agent"],
        metadata: {
          eligible: result.report.eligible,
          eligibilityStatus: result.report3?.eligibilityStatus ?? null,
          ingredientMatchingStatus: result.report3?.ingredientMatchingStatus ?? null,
          aicisScrutinyStatus: result.report3?.aicisScrutinyStatus ?? null,
          bannedRestrictedStatus: result.report3?.bannedRestrictedStatus ?? null,
          checksCount: result.report.checks.length,
          issueCount: result.report3?.issues.length ?? 0,
          failedChecks: result.report.checks
            .filter((c) => !c.passed)
            .map((c) => c.key),
        },
      });

      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "REQUEST_NOT_FOUND") {
        res.status(404).json({ code: "NOT_FOUND", message: "Compliance request not found" });
        return;
      }
      if (msg === "ALREADY_APPROVED") {
        res.status(400).json({ code: "ALREADY_APPROVED", message: "Request is already approved." });
        return;
      }
      throw err;
    }
  },
);

// ──────────────────────────────────────────────────────────────
// POST /compliance-requests/:id/approve
// Single-admin approval: only Uma (ADMIN) can approve.
// Gated by bannedRestrictedStatus == PASS (ingredient matching & AICIS are informational only).
// ──────────────────────────────────────────────────────────────
complianceRequestsRouter.post(
  "/compliance-requests/:id/approve",
  requireRole("ADMIN"),
  async (req, res) => {
    const { comment } = req.body as { comment?: string };

    try {
      const result = await approveRequest(
        (req.params.id as string),
        req.auth!.userId,
        comment,
      );

      // Audit: approval recorded
      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "COMPLIANCE_REQUEST_APPROVED",
        entityType: "compliance_request",
        entityId: (req.params.id as string),
        requestId: req.requestId,
        ip: (Array.isArray(req.ip) ? req.ip[0] : req.ip) ?? undefined,
        userAgent: Array.isArray(req.headers["user-agent"]) ? req.headers["user-agent"][0] : req.headers["user-agent"],
        metadata: {
          comment: comment ?? null,
          artifactCount: result.artifacts.length,
          artifactTypes: result.artifacts.map((a) => a.type),
        },
      });

      // Audit: each generated artifact
      for (const artifact of result.artifacts) {
        await writeAuditLog({
          actorUserId: req.auth!.userId,
          action: "ARTIFACT_GENERATED",
          entityType: "generated_artifact",
          entityId: artifact.id,
          requestId: req.requestId,
          ip: (Array.isArray(req.ip) ? req.ip[0] : req.ip) ?? undefined,
          userAgent: Array.isArray(req.headers["user-agent"]) ? req.headers["user-agent"][0] : req.headers["user-agent"],
          metadata: {
            type: artifact.type,
            versionNumber: artifact.versionNumber,
            requestId: (req.params.id as string),
          },
        });
      }

      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "REQUEST_NOT_FOUND") {
        res.status(404).json({ code: "NOT_FOUND", message: "Compliance request not found" });
        return;
      }
      if (msg === "ALREADY_APPROVED") {
        res.status(400).json({ code: "ALREADY_APPROVED", message: "Request is already approved." });
        return;
      }
      if (msg === "NOT_READY_FOR_APPROVAL") {
        res.status(400).json({
          code: "NOT_READY",
          message: "Cannot approve: run compliance checks and ensure Banned/Restricted Scrutiny passes.",
        });
        return;
      }
      if (msg.startsWith("NOT_AUTHORIZED_APPROVER")) {
        res.status(403).json({
          code: "NOT_AUTHORIZED_APPROVER",
          message: msg.replace("NOT_AUTHORIZED_APPROVER: ", ""),
        });
        return;
      }
      throw err;
    }
  },
);

// ──────────────────────────────────────────────────────────────
// GET /compliance-requests/:id/artifacts
// List all generated artifacts for a compliance request.
// ──────────────────────────────────────────────────────────────
complianceRequestsRouter.get(
  "/compliance-requests/:id/artifacts",
  async (req, res) => {
    const artifacts = await getArtifacts((req.params.id as string));
    res.json({ artifacts });
  },
);

// ──────────────────────────────────────────────────────────────
// GET /compliance-requests/:id/artifacts/:artifactId/export.pdf
// GET /compliance-requests/:id/artifacts/:artifactId/export.docx
// Export generated artifact as PDF or Word.
// ──────────────────────────────────────────────────────────────
complianceRequestsRouter.get(
  "/compliance-requests/:id/artifacts/:artifactId/export.:format",
  async (req, res) => {
    const requestId = req.params.id as string;
    const artifactId = req.params.artifactId as string;
    const format = (req.params.format as string)?.toLowerCase();

    if (format !== "pdf" && format !== "docx") {
      res.status(400).json({ code: "INVALID_FORMAT", message: "Format must be pdf or docx" });
      return;
    }

    const artifact = await getArtifactById(artifactId);
    if (!artifact || artifact.requestId !== requestId) {
      res.status(404).json({ code: "NOT_FOUND", message: "Artifact not found" });
      return;
    }

    try {
      const buffer = format === "pdf"
        ? await generateArtifactPdf(artifact)
        : await generateArtifactDocx(artifact);
      const ext = format === "pdf" ? "pdf" : "docx";
      const mimeType = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const filename = `${artifact.type.toLowerCase().replace(/_/g, "-")}-v${artifact.versionNumber}.${ext}`;

      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      logger.error({ err, artifactId, format }, "Artifact export failed");
      res.status(500).json({ code: "EXPORT_FAILED", message: "Failed to generate export" });
    }
  },
);

// ──────────────────────────────────────────────────────────────
// GET /compliance-requests/:id/artifacts/:artifactId
// Get a specific generated artifact.
// ──────────────────────────────────────────────────────────────
complianceRequestsRouter.get(
  "/compliance-requests/:id/artifacts/:artifactId",
  async (req, res) => {
    const artifact = await getArtifactById((req.params.artifactId as string));
    if (!artifact || artifact.requestId !== (req.params.id as string)) {
      res.status(404).json({ code: "NOT_FOUND", message: "Artifact not found" });
      return;
    }
    res.json({ artifact });
  },
);

// ══════════════════════════════════════════════════════════════
// Compliance Report Exports (Excel + PDF)
// ══════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────
// GET /products/:productId/compliance/report.xlsx
// Download compliance exceptions report as Excel
// ──────────────────────────────────────────────────────────────
complianceRequestsRouter.get(
  "/products/:productId/compliance/report.xlsx",
  async (req, res) => {
    const productId = req.params.productId as string;

    try {
      const reportData = await buildComplianceReportData(productId);

      logger.info({
        event: "COMPLIANCE_REPORT_EXPORT",
        productId,
        format: "xlsx",
        exceptions: reportData.exceptions.length,
      });

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "COMPLIANCE_REPORT_EXPORTED",
        entityType: "product",
        entityId: productId,
        requestId: req.requestId,
        ip: (Array.isArray(req.ip) ? req.ip[0] : req.ip) ?? undefined,
        userAgent: Array.isArray(req.headers["user-agent"]) ? req.headers["user-agent"][0] : req.headers["user-agent"],
        metadata: {
          productId,
          format: "xlsx",
          exceptionsCount: reportData.exceptions.length,
          checkedAt: reportData.summary.checkedAt,
        },
      });

      const buffer = await generateExcelReport(reportData);
      const date = new Date().toISOString().slice(0, 10);
      const filename = `compliance-report-${reportData.summary.skuCode}-${date}.xlsx`;

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "PRODUCT_NOT_FOUND") {
        res.status(404).json({ code: "NOT_FOUND", message: "Product not found" });
        return;
      }
      if (msg === "NO_COMPLIANCE_RUN") {
        res.status(400).json({ code: "NO_COMPLIANCE_RUN", message: "No compliance run available for this product." });
        return;
      }
      throw err;
    }
  },
);

// ──────────────────────────────────────────────────────────────
// GET /products/:productId/compliance/report.pdf
// Download compliance exceptions report as PDF
// ──────────────────────────────────────────────────────────────
complianceRequestsRouter.get(
  "/products/:productId/compliance/report.pdf",
  async (req, res) => {
    const productId = req.params.productId as string;

    try {
      const reportData = await buildComplianceReportData(productId);

      logger.info({
        event: "COMPLIANCE_REPORT_EXPORT",
        productId,
        format: "pdf",
        exceptions: reportData.exceptions.length,
      });

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "COMPLIANCE_REPORT_EXPORTED",
        entityType: "product",
        entityId: productId,
        requestId: req.requestId,
        ip: (Array.isArray(req.ip) ? req.ip[0] : req.ip) ?? undefined,
        userAgent: Array.isArray(req.headers["user-agent"]) ? req.headers["user-agent"][0] : req.headers["user-agent"],
        metadata: {
          productId,
          format: "pdf",
          exceptionsCount: reportData.exceptions.length,
          checkedAt: reportData.summary.checkedAt,
        },
      });

      const buffer = await generatePdfReport(reportData);
      const date = new Date().toISOString().slice(0, 10);
      const filename = `compliance-report-${reportData.summary.skuCode}-${date}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "PRODUCT_NOT_FOUND") {
        res.status(404).json({ code: "NOT_FOUND", message: "Product not found" });
        return;
      }
      if (msg === "NO_COMPLIANCE_RUN") {
        res.status(400).json({ code: "NO_COMPLIANCE_RUN", message: "No compliance run available for this product." });
        return;
      }
      throw err;
    }
  },
);

// ──────────────────────────────────────────────────────────────
// GET /products/:productId/compliance/report.csv
// Download compliance exceptions report as CSV
// ──────────────────────────────────────────────────────────────
complianceRequestsRouter.get(
  "/products/:productId/compliance/report.csv",
  async (req, res) => {
    const productId = req.params.productId as string;

    try {
      const reportData = await buildComplianceReportData(productId);

      logger.info({
        event: "COMPLIANCE_REPORT_EXPORT",
        productId,
        format: "csv",
        exceptions: reportData.exceptions.length,
      });

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "COMPLIANCE_REPORT_EXPORTED",
        entityType: "product",
        entityId: productId,
        requestId: req.requestId,
        ip: (Array.isArray(req.ip) ? req.ip[0] : req.ip) ?? undefined,
        userAgent: Array.isArray(req.headers["user-agent"]) ? req.headers["user-agent"][0] : req.headers["user-agent"],
        metadata: { productId, format: "csv", exceptionsCount: reportData.exceptions.length },
      });

      const csvHeaders = [
        "ingredientName", "inciName", "casNo", "issueType",
        "issueDetails", "suggestedAction", "evidenceRequired",
      ];

      const csvRows = reportData.exceptions.map((ex) => [
        ex.ingredient, ex.inciName ?? "", ex.casNumber ?? "",
        ex.issueCategory, ex.reason, ex.source, ex.evidenceRequired,
      ]);

      const escapeCsv = (v: string) => {
        if (v.includes(",") || v.includes('"') || v.includes("\n")) {
          return `"${v.replace(/"/g, '""')}"`;
        }
        return v;
      };

      const csvContent = [
        csvHeaders.join(","),
        ...csvRows.map((row) => row.map(escapeCsv).join(",")),
      ].join("\n");

      const date = new Date().toISOString().slice(0, 10);
      const filename = `compliance-report-${reportData.summary.skuCode}-${date}.csv`;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csvContent);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "PRODUCT_NOT_FOUND") {
        res.status(404).json({ code: "NOT_FOUND", message: "Product not found" });
        return;
      }
      if (msg === "NO_COMPLIANCE_RUN") {
        res.status(400).json({ code: "NO_COMPLIANCE_RUN", message: "No compliance run available for this product." });
        return;
      }
      throw err;
    }
  },
);

