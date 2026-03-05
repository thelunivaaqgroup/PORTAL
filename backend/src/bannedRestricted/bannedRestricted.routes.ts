import { Router } from "express";
import multer from "multer";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { writeAuditLog } from "../audit/audit.service.js";
import {
  getLatestSnapshot,
  getSnapshotById,
  findChemicalsByCas,
  getChemicalById,
  evaluateUpload,
} from "./bannedRestricted.service.js";
import { importArtifacts, KNOWN_SOURCE_URLS } from "./importArtifacts.js";
import { ingestEvidencePack, type EvidencePackFile } from "./ingestEvidencePack.js";
import type { BannedRestrictedLinkType } from "@prisma/client";

// ── Multer setup for artifact PDF uploads ──

const ARTIFACT_DIR = join(process.cwd(), "storage", "banned_restricted_artifacts");

// Ensure directory exists at startup
mkdir(ARTIFACT_DIR, { recursive: true }).catch(() => {});

const artifactUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, ARTIFACT_DIR),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const ext = file.originalname.split(".").pop() || "bin";
      cb(null, `${unique}.${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB per file (PDFs can be large)
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "text/html",
      "text/plain",
      "application/xhtml+xml",
    ];
    if (
      allowed.includes(file.mimetype) ||
      file.originalname.match(/\.(pdf|html|htm|txt)$/i)
    ) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Only PDF, HTML, and TXT files are accepted.`));
    }
  },
});

export const bannedRestrictedRouter = Router();

bannedRestrictedRouter.use(requireAuth);

// ──────────────────────────────────────────────────────────────
// POST /banned-restricted/sync
// DEPRECATED: Live scraping has been removed. Use the offline
// restricted chemical index instead: POST /restricted/evidence-pack/upload
// ──────────────────────────────────────────────────────────────
bannedRestrictedRouter.post(
  "/sync",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (_req, res) => {
    res.status(410).json({
      code: "DEPRECATED",
      message:
        "Live web scraping has been permanently removed. " +
        "Upload a restricted chemicals CSV via POST /restricted/evidence-pack/upload instead.",
    });
  },
);

// ──────────────────────────────────────────────────────────────
// POST /banned-restricted/import-artifacts
// Upload official evidence PDFs, extract CAS, store snapshot
// ──────────────────────────────────────────────────────────────
bannedRestrictedRouter.post(
  "/import-artifacts",
  requireRole("SUPER_ADMIN"),
  artifactUpload.array("files", 10),
  async (req, res) => {
    try {
      const uploadedFiles = req.files as Express.Multer.File[] | undefined;
      if (!uploadedFiles || uploadedFiles.length === 0) {
        res.status(400).json({
          code: "VALIDATION",
          message: "No files uploaded. Attach PDF files under the 'files' field.",
        });
        return;
      }

      // Parse metadata JSON — sent as a 'metadata' field, JSON array
      // Each entry: { linkType: string, sourceUrl: string }
      let metadata: { linkType: string; sourceUrl: string }[];
      try {
        const raw = req.body.metadata;
        metadata = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!Array.isArray(metadata)) throw new Error("metadata must be an array");
      } catch {
        res.status(400).json({
          code: "VALIDATION",
          message:
            "metadata field is required and must be a JSON array of { linkType, sourceUrl } objects, one per uploaded file.",
        });
        return;
      }

      if (metadata.length !== uploadedFiles.length) {
        res.status(400).json({
          code: "VALIDATION",
          message: `metadata array length (${metadata.length}) must match uploaded files count (${uploadedFiles.length}).`,
        });
        return;
      }

      // Validate each metadata entry
      for (let i = 0; i < metadata.length; i++) {
        const m = metadata[i];
        if (!m.linkType || !m.sourceUrl) {
          res.status(400).json({
            code: "VALIDATION",
            message: `metadata[${i}] must have linkType and sourceUrl.`,
          });
          return;
        }
      }

      // Build artifact list
      const artifacts = uploadedFiles.map((file, i) => ({
        linkType: metadata[i].linkType as BannedRestrictedLinkType,
        sourceUrl: metadata[i].sourceUrl,
        filePath: file.path,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      }));

      const result = await importArtifacts(req.auth!.userId, artifacts);

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "BANNED_RESTRICTED_ARTIFACTS_IMPORTED",
        entityType: "banned_restricted_snapshot",
        entityId: result.snapshotId,
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          filesCount: uploadedFiles.length,
          fileNames: uploadedFiles.map((f) => f.originalname),
          linkTypes: metadata.map((m) => m.linkType),
          sourcesTotal: result.sourcesTotal,
          sourcesSuccess: result.sourcesSuccess,
          sourcesFailed: result.sourcesFailed,
          chemicalsCount: result.chemicalsCount,
          isComplete: result.isComplete,
        },
      });

      res.status(201).json({ result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      res.status(500).json({ code: "IMPORT_FAILED", message });
    }
  },
);

// ──────────────────────────────────────────────────────────────
// POST /banned-restricted/ingest-pack
// Ingest offline evidence pack (PDFs) for deterministic compliance
// ──────────────────────────────────────────────────────────────
bannedRestrictedRouter.post(
  "/ingest-pack",
  requireRole("SUPER_ADMIN", "ADMIN"),
  artifactUpload.array("files", 20),
  async (req, res) => {
    try {
      const uploadedFiles = req.files as Express.Multer.File[] | undefined;
      if (!uploadedFiles || uploadedFiles.length === 0) {
        res.status(400).json({
          code: "VALIDATION",
          message: "No files uploaded. Attach PDF files under the 'files' field.",
        });
        return;
      }

      // Optional: metadata JSON array with { linkType } per file
      // If not provided, linkType is inferred from filename
      let metadata: { linkType?: string }[] | null = null;
      if (req.body.metadata) {
        try {
          const raw = req.body.metadata;
          metadata = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (!Array.isArray(metadata)) throw new Error("metadata must be an array");
        } catch {
          res.status(400).json({
            code: "VALIDATION",
            message: "metadata field must be a JSON array of { linkType } objects.",
          });
          return;
        }
      }

      const packLabel = (req.body.packLabel as string) || undefined;

      // Build file list
      const files: EvidencePackFile[] = uploadedFiles.map((file, i) => {
        let linkType: BannedRestrictedLinkType = "OTHER";

        // Use metadata linkType if provided
        if (metadata && metadata[i]?.linkType) {
          linkType = metadata[i].linkType as BannedRestrictedLinkType;
        } else {
          // Infer from filename
          linkType = inferLinkTypeFromFilename(file.originalname);
        }

        return {
          linkType,
          filePath: file.path,
          originalName: file.originalname,
        };
      });

      const result = await ingestEvidencePack(req.auth!.userId, files, packLabel);

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "BANNED_RESTRICTED_PACK_INGESTED",
        entityType: "banned_restricted_snapshot",
        entityId: result.snapshotId,
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          packLabel,
          filesCount: uploadedFiles.length,
          fileNames: uploadedFiles.map((f) => f.originalname),
          sourcesTotal: result.sourcesTotal,
          sourcesSuccess: result.sourcesSuccess,
          sourcesFailed: result.sourcesFailed,
          chemicalsCount: result.chemicalsCount,
          poisonsNameOnlyCount: result.poisonsNameOnlyCount,
          isComplete: result.isComplete,
        },
      });

      res.status(201).json({ result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ingestion failed";
      res.status(500).json({ code: "INGEST_FAILED", message });
    }
  },
);

/** Infer BannedRestrictedLinkType from a filename */
function inferLinkTypeFromFilename(filename: string): BannedRestrictedLinkType {
  const lower = filename.toLowerCase();

  // Check prefix convention
  const dashIdx = filename.indexOf("-");
  if (dashIdx > 0) {
    const prefix = filename.slice(0, dashIdx).toUpperCase();
    const map: Record<string, BannedRestrictedLinkType> = {
      HUB: "HUB", ROTTERDAM_IMPORT: "ROTTERDAM_IMPORT", ROTTERDAM_EXPORT: "ROTTERDAM_EXPORT",
      MINAMATA: "MINAMATA", STOCKHOLM: "STOCKHOLM", STOCKHOLM_POP: "STOCKHOLM_POP",
      POISONS_STANDARD: "POISONS_STANDARD", OTHER: "OTHER",
    };
    if (map[prefix]) return map[prefix];
  }

  // Keyword inference
  if (lower.includes("poisons") || lower.includes("susmp") || lower.includes("therapeutic")) return "POISONS_STANDARD";
  if (lower.includes("rotterdam") && lower.includes("import")) return "ROTTERDAM_IMPORT";
  if (lower.includes("rotterdam") && lower.includes("export")) return "ROTTERDAM_EXPORT";
  if (lower.includes("rotterdam")) return "ROTTERDAM_IMPORT";
  if (lower.includes("minamata") || lower.includes("mercury")) return "MINAMATA";
  if (lower.includes("stockholm") || lower.includes("pop")) return "STOCKHOLM_POP";
  if (lower.includes("banned") || lower.includes("restricted") || lower.includes("aicis")) return "HUB";
  return "OTHER";
}

// ──────────────────────────────────────────────────────────────
// POST /banned-restricted/ingest-offline
// Dedicated offline pack ingestion — accepts multipart PDFs,
// auto-infers linkType, creates a complete snapshot.
// ──────────────────────────────────────────────────────────────
bannedRestrictedRouter.post(
  "/ingest-offline",
  requireRole("SUPER_ADMIN", "ADMIN"),
  artifactUpload.array("files", 20),
  async (req, res) => {
    try {
      const uploadedFiles = req.files as Express.Multer.File[] | undefined;
      if (!uploadedFiles || uploadedFiles.length === 0) {
        res.status(400).json({
          code: "VALIDATION",
          message: "No files uploaded. Attach PDF files under the 'files' field.",
        });
        return;
      }

      const snapshotName = (req.body.snapshotName as string) ||
        `AU_BR_${new Date().toISOString().slice(0, 10).replace(/-/g, "_")}`;

      const files: EvidencePackFile[] = uploadedFiles.map((file) => ({
        linkType: inferLinkTypeFromFilename(file.originalname),
        filePath: file.path,
        originalName: file.originalname,
      }));

      const result = await ingestEvidencePack(req.auth!.userId, files, snapshotName);

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "BANNED_RESTRICTED_OFFLINE_INGESTED",
        entityType: "banned_restricted_snapshot",
        entityId: result.snapshotId,
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          snapshotName,
          filesCount: uploadedFiles.length,
          fileNames: uploadedFiles.map((f) => f.originalname),
          sourcesTotal: result.sourcesTotal,
          sourcesSuccess: result.sourcesSuccess,
          sourcesFailed: result.sourcesFailed,
          chemicalsCount: result.chemicalsCount,
          poisonsNameOnlyCount: result.poisonsNameOnlyCount,
          isComplete: result.isComplete,
        },
      });

      res.status(201).json({ result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Offline ingestion failed";
      res.status(500).json({ code: "INGEST_OFFLINE_FAILED", message });
    }
  },
);

// ──────────────────────────────────────────────────────────────
// GET /banned-restricted/known-sources
// Return the list of known official source URLs for the upload UI
// ──────────────────────────────────────────────────────────────
bannedRestrictedRouter.get("/known-sources", (_req, res) => {
  res.json({ sources: KNOWN_SOURCE_URLS });
});

// ──────────────────────────────────────────────────────────────
// GET /banned-restricted/snapshots/latest
// Return latest banned/restricted snapshot with sources + chemicals
// ──────────────────────────────────────────────────────────────
bannedRestrictedRouter.get("/snapshots/latest", async (_req, res) => {
  const snapshot = await getLatestSnapshot();
  if (!snapshot) {
    res.json({ snapshot: null });
    return;
  }
  res.json({ snapshot });
});

// ──────────────────────────────────────────────────────────────
// GET /banned-restricted/snapshots/:id
// Return specific snapshot
// ──────────────────────────────────────────────────────────────
bannedRestrictedRouter.get("/snapshots/:id", async (req, res) => {
  const snapshot = await getSnapshotById(req.params.id);
  if (!snapshot) {
    res.status(404).json({ code: "NOT_FOUND", message: "Snapshot not found" });
    return;
  }
  res.json({ snapshot });
});

// ──────────────────────────────────────────────────────────────
// GET /banned-restricted/uploads/:uploadId/evaluate
// Evaluate all upload rows against latest banned/restricted snapshot
// ──────────────────────────────────────────────────────────────
bannedRestrictedRouter.get("/uploads/:uploadId/evaluate", async (req, res) => {
  try {
    const result = await evaluateUpload(req.params.uploadId);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Evaluation failed";
    if (message === "UPLOAD_NOT_FOUND") {
      res.status(404).json({ code: "NOT_FOUND", message: "Upload not found" });
      return;
    }
    res.status(422).json({ code: "EVALUATION_FAILED", message });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /banned-restricted/chemicals?casNo=...
// Return chemicals for a specific CAS number
// ──────────────────────────────────────────────────────────────
bannedRestrictedRouter.get("/chemicals", async (req, res) => {
  const casNo = req.query.casNo as string | undefined;
  if (!casNo) {
    res.status(400).json({ code: "VALIDATION", message: "casNo query parameter required" });
    return;
  }

  const chemicals = await findChemicalsByCas(casNo);
  res.json({ chemicals, count: chemicals.length });
});

// ──────────────────────────────────────────────────────────────
// GET /banned-restricted/chemicals/:id
// Return a specific chemical record
// ──────────────────────────────────────────────────────────────
bannedRestrictedRouter.get("/chemicals/:id", async (req, res) => {
  const chemical = await getChemicalById(req.params.id);
  if (!chemical) {
    res.status(404).json({ code: "NOT_FOUND", message: "Chemical not found" });
    return;
  }
  res.json({ chemical });
});
