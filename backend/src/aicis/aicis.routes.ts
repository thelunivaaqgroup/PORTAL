import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { importAicisInventoryFromBuffer } from "./aicis.importer.js";
import {
  getLatestSnapshot,
  getActiveSnapshot,
  getChemicalById,
  runAicisScrutinyForUpload,
  getLatestScrutinyForUpload,
} from "./aicis.service.js";

export const aicisRouter = Router();

aicisRouter.use(requireAuth);

// Multer: memory storage, max 50MB, xlsx only
const aicisUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.originalname.endsWith(".xlsx") ||
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only .xlsx files are allowed"));
    }
  },
});

// ──────────────────────────────────────────────────────────────
// POST /aicis/import
// Upload AICIS Inventory Excel → parse → store snapshot + chemicals
// ──────────────────────────────────────────────────────────────
aicisRouter.post(
  "/import",
  requireRole("SUPER_ADMIN", "ADMIN"),
  aicisUpload.single("file"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ code: "VALIDATION", message: "file is required (.xlsx)" });
      return;
    }

    const regionCode = (req.body?.regionCode as string) || "AU";
    const versionName = (req.body?.versionName as string) || undefined;
    const notes = (req.body?.notes as string) || undefined;

    try {
      const result = await importAicisInventoryFromBuffer({
        regionCode,
        versionName,
        fileBuffer: req.file.buffer,
        originalFilename: req.file.originalname,
        actorUserId: req.auth!.userId,
        requestId: req.requestId,
        notes,
      });

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "AICIS_SNAPSHOT_IMPORTED",
        entityType: "aicis_inventory_snapshot",
        entityId: result.snapshotId,
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          versionName: result.versionName,
          regionCode: result.regionCode,
          rowCount: result.rowCount,
          fileSha256: result.fileSha256,
          sourceFilename: result.sourceFilename,
        },
      });

      res.status(201).json({ snapshot: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      if (message.startsWith("MISSING_REQUIRED_COLUMNS")) {
        res.status(400).json({ code: "PARSE_ERROR", message });
        return;
      }
      if (message === "EMPTY_WORKBOOK" || message === "INSUFFICIENT_ROWS") {
        res.status(400).json({ code: "PARSE_ERROR", message: "Excel file has no usable data" });
        return;
      }
      res.status(422).json({ code: "IMPORT_FAILED", message });
    }
  },
);

// ──────────────────────────────────────────────────────────────
// GET /aicis/active?regionCode=AU
// Return the currently active AICIS inventory snapshot
// ──────────────────────────────────────────────────────────────
aicisRouter.get("/active", async (req, res) => {
  const regionCode = (req.query.regionCode as string) || "AU";

  const snapshot = await getActiveSnapshot(regionCode);
  if (!snapshot) {
    res.json({ active: false, snapshot: null });
    return;
  }

  res.json({
    active: true,
    snapshot: {
      id: snapshot.id,
      versionName: snapshot.versionName,
      regionCode: snapshot.regionCode,
      sourceFileName: snapshot.sourceFileName,
      fileSha256: snapshot.fileSha256,
      rowCount: snapshot.rowCount,
      isActive: snapshot.isActive,
      importedAt: snapshot.importedAt,
      importedBy: snapshot.importedBy,
      chemicalCount: snapshot._count.chemicals,
    },
  });
});

// ──────────────────────────────────────────────────────────────
// GET /aicis/snapshots/latest
// Return latest AICIS inventory snapshot metadata
// ──────────────────────────────────────────────────────────────
aicisRouter.get("/snapshots/latest", async (_req, res) => {
  const snapshot = await getLatestSnapshot();
  if (!snapshot) {
    res.status(404).json({ code: "NOT_FOUND", message: "No AICIS snapshot imported yet" });
    return;
  }
  res.json({
    snapshot: {
      id: snapshot.id,
      versionName: snapshot.versionName,
      asOfDate: snapshot.asOfDate,
      sourceFileName: snapshot.sourceFileName,
      importedAt: snapshot.importedAt,
      chemicalCount: snapshot._count.chemicals,
    },
  });
});

// ──────────────────────────────────────────────────────────────
// GET /aicis/chemicals/:chemicalId
// Return a single AICIS inventory chemical record (for evidence links)
// ──────────────────────────────────────────────────────────────
aicisRouter.get("/chemicals/:chemicalId", async (req, res) => {
  const chemicalId = req.params.chemicalId as string;

  const chemical = await getChemicalById(chemicalId);
  if (!chemical) {
    res.status(404).json({ code: "NOT_FOUND", message: "Chemical not found" });
    return;
  }

  res.json({ chemical });
});

// ──────────────────────────────────────────────────────────────
// POST /uploads/:uploadId/aicis/run
// Run AICIS scrutiny for a specific upload
// ──────────────────────────────────────────────────────────────
aicisRouter.post(
  "/uploads/:uploadId/run",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const uploadId = req.params.uploadId as string;
    const region = (req.query.region as string) || "AU";

    try {
      const result = await runAicisScrutinyForUpload(
        uploadId,
        region,
        req.auth!.userId,
      );

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "AICIS_SCRUTINY_RUN",
        entityType: "upload_aicis_scrutiny_snapshot",
        entityId: result.scrutinySnapshotId,
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          uploadId,
          regionCode: region,
          status: result.status,
          foundCount: result.foundCount,
          notFoundCount: result.notFoundCount,
          missingCasCount: result.missingCasCount,
        },
      });

      res.status(201).json({ scrutiny: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Scrutiny failed";
      if (message === "NO_AICIS_SNAPSHOT") {
        res.status(400).json({
          code: "NO_AICIS_SNAPSHOT",
          message: "No AICIS inventory snapshot has been imported yet",
        });
        return;
      }
      if (message === "UPLOAD_NOT_FOUND") {
        res.status(404).json({ code: "UPLOAD_NOT_FOUND", message: "Upload not found" });
        return;
      }
      res.status(422).json({ code: "SCRUTINY_FAILED", message });
    }
  },
);

// ──────────────────────────────────────────────────────────────
// GET /uploads/:uploadId/aicis/latest
// Return latest active scrutiny for upload + region
// ──────────────────────────────────────────────────────────────
aicisRouter.get("/uploads/:uploadId/latest", async (req, res) => {
  const uploadId = req.params.uploadId as string;
  const region = (req.query.region as string) || "AU";

  const scrutiny = await getLatestScrutinyForUpload(uploadId, region);
  if (!scrutiny) {
    res.status(404).json({
      code: "NOT_FOUND",
      message: "No AICIS scrutiny found for this upload",
    });
    return;
  }

  res.json({ scrutiny });
});
