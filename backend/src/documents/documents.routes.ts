import { Router } from "express";
import { createReadStream, existsSync } from "node:fs";
import multer from "multer";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { listDocuments, uploadDocument, getDocumentById } from "./documents.service.js";
import { recomputeProductStage } from "../products/productStage.service.js";
import {
  VALID_DOC_TYPES,
  EXPIRY_REQUIRED_TYPES,
  ALLOWED_MIME_TYPES,
} from "./documents.types.js";
import { scheduleAlertsSweep } from "../alerts/alerts.scheduler.js";
import type { ProductDocumentType } from "@prisma/client";

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

// ──────────────────────────────────────────────────────────────
// GET /products/:productId/documents
// ──────────────────────────────────────────────────────────────
documentsRouter.get("/:productId/documents", async (req, res) => {
  const { productId } = req.params;
  const documents = await listDocuments(productId as string);
  res.json({ documents });
});

// ──────────────────────────────────────────────────────────────
// POST /products/:productId/documents
// ──────────────────────────────────────────────────────────────
documentsRouter.post(
  "/:productId/documents",
  requireRole("SUPER_ADMIN", "ADMIN"),
  upload.single("file"),
  async (req, res) => {
    const { productId } = req.params;
    const file = req.file;

    if (!file) {
      res.status(400).json({ code: "VALIDATION", message: "file is required" });
      return;
    }

    const { type, issueDate, expiryDate, notes } = req.body;

    if (!type || !VALID_DOC_TYPES.includes(type)) {
      res.status(400).json({
        code: "VALIDATION",
        message: `type must be one of: ${VALID_DOC_TYPES.join(", ")}`,
      });
      return;
    }

    // COA/SDS require expiryDate
    if (EXPIRY_REQUIRED_TYPES.includes(type) && !expiryDate) {
      res.status(400).json({
        code: "VALIDATION",
        message: `expiryDate is required for ${type}`,
      });
      return;
    }

    try {
      const doc = await uploadDocument(
        productId as string,
        type as ProductDocumentType,
        { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype },
        { issueDate, expiryDate, notes },
        req.auth!.userId,
      );

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "PRODUCT_DOCUMENT_UPLOADED",
        entityType: "product_document",
        entityId: doc.id,
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { productId, type, versionNumber: doc.versionNumber },
      });

      // Recompute product stage (may advance to PACKAGING_READY)
      try {
        await recomputeProductStage(productId as string, req.auth!.userId);
      } catch (_) { /* non-fatal */ }

      try { scheduleAlertsSweep("document_change"); } catch (_) { /* non-fatal */ }

      res.status(201).json({ document: doc });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      res.status(422).json({ code: "UPLOAD_FAILED", message });
    }
  },
);

// ──────────────────────────────────────────────────────────────
// GET /products/:productId/documents/:docId/download
// ──────────────────────────────────────────────────────────────
documentsRouter.get("/:productId/documents/:docId/download", async (req, res) => {
  const { docId } = req.params;

  const doc = await getDocumentById(docId as string);
  if (!doc) {
    res.status(404).json({ code: "NOT_FOUND", message: "Document not found" });
    return;
  }

  if (!existsSync(doc.filePath)) {
    res.status(404).json({ code: "NOT_FOUND", message: "File not found on disk" });
    return;
  }

  await writeAuditLog({
    actorUserId: req.auth!.userId,
    action: "PRODUCT_DOCUMENT_DOWNLOADED",
    entityType: "product_document",
    entityId: doc.id,
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: { productId: doc.productId, type: doc.type },
  });

  res.setHeader("Content-Type", doc.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${doc.originalFilename}"`);
  createReadStream(doc.filePath).pipe(res);
});
