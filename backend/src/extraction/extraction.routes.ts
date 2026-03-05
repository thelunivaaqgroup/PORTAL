import { Router } from "express";
import multer from "multer";
import { join } from "node:path";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { prisma } from "../prisma.js";
import { getVersionById } from "../formulations/formulations.service.js";
import { runExtraction, getLatestExtractionJob, applyExtraction } from "./extraction.service.js";
import type { UploadBody, ApplyBody } from "./extraction.types.js";

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
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(csv|xlsx|xls|pdf|png|jpg|jpeg|webp)$/i)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

export const extractionRouter = Router();

extractionRouter.use(requireAuth);

// ──────────────────────────────────────────────────────────────
// POST /versions/:versionId/formulation-upload
// ──────────────────────────────────────────────────────────────
extractionRouter.post(
  "/:versionId/formulation-upload",
  requireRole("SUPER_ADMIN", "ADMIN"),
  upload.single("file"),
  async (req, res) => {
    const version = await getVersionById(req.params.versionId);
    if (!version) {
      res.status(404).json({ code: "NOT_FOUND", message: "Version not found" });
      return;
    }

    if (version.status === "APPROVED" || version.status === "IN_REVIEW") {
      res.status(400).json({ code: "VERSION_LOCKED", message: "Cannot upload to a version that is approved or in review" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ code: "VALIDATION", message: "file is required (multipart field name: file)" });
      return;
    }

    const { modeHint } = (req.body || {}) as UploadBody;
    if (modeHint && modeHint !== "REPLACE" && modeHint !== "APPEND") {
      res.status(400).json({ code: "VALIDATION", message: "modeHint must be REPLACE or APPEND" });
      return;
    }

    // Create UploadedFile record
    const uploadedFile = await prisma.uploadedFile.create({
      data: {
        versionId: version.id,
        originalName: file.originalname,
        mimeType: file.mimetype,
        storagePath: file.path,
        sizeBytes: file.size,
      },
    });

    // Create ExtractionJob
    const job = await prisma.extractionJob.create({
      data: {
        versionId: version.id,
        fileId: uploadedFile.id,
        status: "PENDING",
        modeHint: modeHint || null,
      },
    });

    await writeAuditLog({
      actorUserId: req.auth!.userId,
      action: "FORMULATION_FILE_UPLOADED",
      entityType: "uploaded_file",
      entityId: uploadedFile.id,
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        versionId: version.id,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        modeHint: modeHint || null,
      },
    });

    // Run extraction synchronously
    try {
      const completedJob = await runExtraction(job.id);

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "EXTRACTION_JOB_COMPLETED",
        entityType: "extraction_job",
        entityId: job.id,
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          versionId: version.id,
          extractedRowCount: completedJob.extractedIngredients.length,
        },
      });

      res.status(201).json({
        jobId: completedJob.id,
        status: completedJob.status,
        extractedRowCount: completedJob.extractedIngredients.length,
        extractedIngredients: completedJob.extractedIngredients,
        modeHint: completedJob.modeHint,
        instructions: `Call POST /versions/${version.id}/formulation-extraction/${completedJob.id}/apply with { "mode": "REPLACE" | "APPEND" } to apply these ingredients.`,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "EXTRACTION_JOB_FAILED",
        entityType: "extraction_job",
        entityId: job.id,
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { versionId: version.id, reason },
      });

      // Fetch the failed job to return
      const failedJob = await prisma.extractionJob.findUnique({ where: { id: job.id } });

      res.status(422).json({
        jobId: job.id,
        status: failedJob?.status || "FAILED",
        failReason: failedJob?.failReason || reason,
        extractedRowCount: 0,
      });
    }
  },
);

// ──────────────────────────────────────────────────────────────
// GET /versions/:versionId/formulation-extraction/latest
// ──────────────────────────────────────────────────────────────
extractionRouter.get("/:versionId/formulation-extraction/latest", async (req, res) => {
  const version = await getVersionById(req.params.versionId);
  if (!version) {
    res.status(404).json({ code: "NOT_FOUND", message: "Version not found" });
    return;
  }

  const job = await getLatestExtractionJob(version.id);
  if (!job) {
    res.status(404).json({ code: "NOT_FOUND", message: "No extraction jobs found for this version" });
    return;
  }

  res.json({
    job: {
      id: job.id,
      status: job.status,
      modeHint: job.modeHint,
      failReason: job.failReason,
      file: {
        id: job.file.id,
        originalName: job.file.originalName,
        mimeType: job.file.mimeType,
        sizeBytes: job.file.sizeBytes,
      },
      extractedIngredients: job.extractedIngredients,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
    },
  });
});

// ──────────────────────────────────────────────────────────────
// POST /versions/:versionId/formulation-extraction/:jobId/apply
// ──────────────────────────────────────────────────────────────
extractionRouter.post(
  "/:versionId/formulation-extraction/:jobId/apply",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const version = await getVersionById(req.params.versionId);
    if (!version) {
      res.status(404).json({ code: "NOT_FOUND", message: "Version not found" });
      return;
    }

    if (version.status !== "DRAFT" && version.status !== "REJECTED") {
      res.status(400).json({
        code: "VERSION_LOCKED",
        message: "Can only apply extraction to versions in DRAFT or REJECTED status",
      });
      return;
    }

    const { mode } = (req.body || {}) as ApplyBody;
    if (!mode || (mode !== "REPLACE" && mode !== "APPEND")) {
      res.status(400).json({ code: "VALIDATION", message: "mode is required and must be REPLACE or APPEND" });
      return;
    }

    try {
      const result = await applyExtraction(req.params.jobId, version.id, mode);

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "EXTRACTION_APPLIED",
        entityType: "formulation_version",
        entityId: version.id,
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          jobId: req.params.jobId,
          mode: result.mode,
          appliedCount: result.appliedCount,
          totalIngredients: result.totalIngredients,
          validationStatus: result.validation.validationStatus,
        },
      });

      res.json({
        applied: {
          mode: result.mode,
          totalIngredients: result.totalIngredients,
        },
        validation: {
          totalPct: result.validation.totalPct.toString(),
          hasDuplicateIngredients: result.validation.hasDuplicateIngredients,
          missingDocTypes: result.validation.missingDocTypes,
          validationStatus: result.validation.validationStatus,
          riskLevel: result.validation.riskLevel,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Apply failed";
      res.status(400).json({ code: "APPLY_FAILED", message });
    }
  },
);
