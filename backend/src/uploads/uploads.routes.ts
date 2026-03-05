import { Router } from "express";
import multer from "multer";
import { join } from "node:path";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { prisma } from "../prisma.js";
import {
  createUploadWithExtraction,
  getLatestUpload,
  listUploads,
  getUploadById,
  manualMatchRow,
} from "./uploads.service.js";

const STORAGE_DIR = join(process.cwd(), "storage", "uploads");

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, STORAGE_DIR),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const ext = file.originalname.split(".").pop() || "bin";
      cb(null, `${unique}.${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
    ];
    if (
      allowed.includes(file.mimetype) ||
      file.originalname.match(/\.(csv|xlsx|xls|pdf|png|jpg|jpeg|webp)$/i)
    ) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

export const uploadsRouter = Router();

uploadsRouter.use(requireAuth);

// ──────────────────────────────────────────────────────────────
// POST /formulations/:formulationId/uploads
// Upload file → parse → AI extract → save FormulationUpload + rows
// ──────────────────────────────────────────────────────────────
uploadsRouter.post(
  "/:formulationId/uploads",
  requireRole("SUPER_ADMIN", "ADMIN"),
  upload.single("file"),
  async (req, res) => {
    const { formulationId } = req.params;

    // Verify formulation exists
    const formulation = await prisma.formulation.findUnique({
      where: { id: formulationId },
    });
    if (!formulation) {
      res.status(404).json({ code: "NOT_FOUND", message: "Formulation not found" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({
        code: "VALIDATION",
        message: "file is required (multipart field name: file)",
      });
      return;
    }

    try {
      const result = await createUploadWithExtraction({
        formulationId,
        userId: req.auth!.userId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath: file.path,
      });

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "FORMULATION_UPLOAD_CREATED",
        entityType: "formulation_upload",
        entityId: result.upload.id,
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          formulationId,
          fileName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          reasonCode: result.reasonCode,
          rowCount: result.rowCount,
        },
      });

      res.status(201).json({
        upload: result.upload,
        uploadId: result.upload.id,
        rowCount: result.rowCount,
        reasonCode: result.reasonCode,
        extractionMode: result.extractionMode,
        parserSummary: result.parserSummary,
        aiSummary: result.aiSummary,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      res.status(422).json({ code: "UPLOAD_FAILED", message });
    }
  },
);

// ──────────────────────────────────────────────────────────────
// GET /formulations/:formulationId/uploads/latest
// Return the most recent upload with rows
// ──────────────────────────────────────────────────────────────
uploadsRouter.get("/:formulationId/uploads/latest", async (req, res) => {
  const { formulationId } = req.params;

  const formulation = await prisma.formulation.findUnique({
    where: { id: formulationId },
  });
  if (!formulation) {
    res.status(404).json({ code: "NOT_FOUND", message: "Formulation not found" });
    return;
  }

  const latest = await getLatestUpload(formulationId);
  if (!latest) {
    res.status(404).json({
      code: "NOT_FOUND",
      message: "No uploads found for this formulation",
    });
    return;
  }

  res.json({ upload: latest });
});

// ──────────────────────────────────────────────────────────────
// GET /formulations/:formulationId/uploads
// List all uploads (history), newest first
// ──────────────────────────────────────────────────────────────
uploadsRouter.get("/:formulationId/uploads", async (req, res) => {
  const { formulationId } = req.params;

  const formulation = await prisma.formulation.findUnique({
    where: { id: formulationId },
  });
  if (!formulation) {
    res.status(404).json({ code: "NOT_FOUND", message: "Formulation not found" });
    return;
  }

  const uploads = await listUploads(formulationId);
  res.json({ uploads });
});

// ──────────────────────────────────────────────────────────────
// GET /formulations/:formulationId/uploads/:uploadId
// Get a single upload by ID
// ──────────────────────────────────────────────────────────────
uploadsRouter.get("/:formulationId/uploads/:uploadId", async (req, res) => {
  const { formulationId, uploadId } = req.params;

  const formulation = await prisma.formulation.findUnique({
    where: { id: formulationId },
  });
  if (!formulation) {
    res.status(404).json({ code: "NOT_FOUND", message: "Formulation not found" });
    return;
  }

  const found = await getUploadById(formulationId, uploadId);
  if (!found) {
    res.status(404).json({ code: "NOT_FOUND", message: "Upload not found" });
    return;
  }

  res.json({ upload: found });
});

// ──────────────────────────────────────────────────────────────
// PATCH /formulations/:formulationId/uploads/rows/:rowId/match
// Manually override the matched ingredient for a single row
// ──────────────────────────────────────────────────────────────
uploadsRouter.patch(
  "/:formulationId/uploads/rows/:rowId/match",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const { formulationId, rowId } = req.params;

    const { ingredientId } = req.body as { ingredientId?: string };
    if (!ingredientId || typeof ingredientId !== "string") {
      res.status(400).json({
        code: "VALIDATION",
        message: "ingredientId is required",
      });
      return;
    }

    // Verify row belongs to an upload in this formulation
    const row = await prisma.formulationUploadRow.findUnique({
      where: { id: rowId },
      include: { upload: { select: { formulationId: true } } },
    });
    if (!row || row.upload.formulationId !== formulationId) {
      res.status(404).json({ code: "NOT_FOUND", message: "Upload row not found" });
      return;
    }

    try {
      const updated = await manualMatchRow(rowId, ingredientId);

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "UPLOAD_ROW_MANUAL_MATCH",
        entityType: "formulation_upload_row",
        entityId: rowId,
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          formulationId,
          rowId,
          ingredientId,
          rawName: row.rawName,
        },
      });

      res.json({ row: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Match failed";
      if (message === "Ingredient not found") {
        res.status(404).json({ code: "NOT_FOUND", message });
        return;
      }
      res.status(422).json({ code: "MATCH_FAILED", message });
    }
  },
);
