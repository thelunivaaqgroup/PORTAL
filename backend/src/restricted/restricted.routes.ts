import { Router } from "express";
import multer from "multer";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { logger } from "../logger.js";
import {
  getActiveDataset,
  listDatasets,
  ingestDataset,
  checkCasNumbers,
  archiveDataset,
} from "./restricted.service.js";
import { buildRestrictedReportData } from "./restrictedReport.service.js";
import { generateRestrictedExcelReport } from "./restrictedReport.excel.js";
import { generateRestrictedPdfReport } from "./restrictedReport.pdf.js";

// ── Multer setup ──

const UPLOAD_DIR = join(process.cwd(), "storage", "restricted_uploads");
mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const ext = file.originalname.split(".").pop() || "bin";
      cb(null, `${unique}.${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === "text/csv" ||
      file.mimetype === "application/zip" ||
      file.mimetype === "application/x-zip-compressed" ||
      file.originalname.match(/\.(csv|zip)$/i)
    ) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Only CSV and ZIP files are accepted.`));
    }
  },
});

export const restrictedRouter = Router();

restrictedRouter.use(requireAuth);

// ──────────────────────────────────────────────────────────────
// GET /restricted/active-dataset
// Get the currently active restricted chemical dataset.
// ──────────────────────────────────────────────────────────────
restrictedRouter.get("/active-dataset", async (_req, res) => {
  const dataset = await getActiveDataset();
  res.json({ dataset });
});

// ──────────────────────────────────────────────────────────────
// GET /restricted/datasets
// List all evidence sources (admin management).
// ──────────────────────────────────────────────────────────────
restrictedRouter.get("/datasets", async (_req, res) => {
  const datasets = await listDatasets();
  res.json({ datasets });
});

// ──────────────────────────────────────────────────────────────
// POST /restricted/evidence-pack/upload
// Upload a CSV (or ZIP containing manifest.json + restricted_index.csv).
// ──────────────────────────────────────────────────────────────
restrictedRouter.post(
  "/evidence-pack/upload",
  requireRole("SUPER_ADMIN", "ADMIN"),
  upload.single("file"),
  async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({
          code: "VALIDATION",
          message: "No file uploaded. Attach a CSV or ZIP file under the 'file' field.",
        });
        return;
      }

      let manifest: {
        name: string;
        versionLabel: string;
        effectiveDate?: string;
        notes?: string;
      };
      let csvContent: string;

      if (file.originalname.endsWith(".zip") || file.mimetype.includes("zip")) {
        // ZIP handling: extract using system unzip, expect manifest.json + restricted_index.csv
        const tmpDir = mkdtempSync(join(tmpdir(), "restricted-"));
        try {
          execSync(`unzip -o "${file.path}" -d "${tmpDir}"`, { stdio: "pipe" });
        } catch {
          res.status(400).json({ code: "VALIDATION", message: "Failed to extract ZIP file." });
          return;
        }

        // Find manifest.json and CSV recursively
        const findFile = (dir: string, name: string): string | null => {
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
              const found = findFile(full, name);
              if (found) return found;
            } else if (entry.name === name || entry.name.endsWith(`.${name.split(".").pop()}`)) {
              if (entry.name === name) return full;
            }
          }
          return null;
        };

        const manifestPath = findFile(tmpDir, "manifest.json");
        // Find any CSV
        const findCsv = (dir: string): string | null => {
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
              const found = findCsv(full);
              if (found) return found;
            } else if (entry.name.endsWith(".csv")) {
              return full;
            }
          }
          return null;
        };
        const csvPath = findCsv(tmpDir);

        if (!manifestPath) {
          res.status(400).json({
            code: "VALIDATION",
            message: "ZIP must contain a manifest.json file.",
          });
          return;
        }
        if (!csvPath) {
          res.status(400).json({
            code: "VALIDATION",
            message: "ZIP must contain a restricted_index.csv file.",
          });
          return;
        }

        manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        csvContent = readFileSync(csvPath, "utf8");
      } else {
        // Plain CSV upload — use body fields for manifest
        csvContent = await readFile(file.path, "utf8");
        manifest = {
          name: (req.body.name as string) || "Restricted Chemicals Dataset",
          versionLabel: (req.body.versionLabel as string) || new Date().toISOString().slice(0, 10),
          effectiveDate: req.body.effectiveDate as string | undefined,
          notes: req.body.notes as string | undefined,
        };
      }

      if (!manifest.name || !manifest.versionLabel) {
        res.status(400).json({
          code: "VALIDATION",
          message: "Manifest must include 'name' and 'versionLabel'.",
        });
        return;
      }

      const result = await ingestDataset(req.auth!.userId, manifest, csvContent);

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "RESTRICTED_DATASET_UPLOADED",
        entityType: "evidence_source",
        entityId: result.id,
        requestId: req.requestId,
        ip: (Array.isArray(req.ip) ? req.ip[0] : req.ip) ?? undefined,
        userAgent: Array.isArray(req.headers["user-agent"])
          ? req.headers["user-agent"][0]
          : req.headers["user-agent"],
        metadata: {
          name: manifest.name,
          versionLabel: manifest.versionLabel,
          chemicalsCount: result.chemicalsCount,
          hashSha256: result.hashSha256,
        },
      });

      res.status(201).json({ dataset: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("CSV")) {
        res.status(400).json({ code: "VALIDATION", message: msg });
        return;
      }
      logger.error({ err }, "Evidence pack upload failed");
      res.status(500).json({ code: "UPLOAD_FAILED", message: msg });
    }
  },
);

// ──────────────────────────────────────────────────────────────
// POST /restricted/check
// Check an array of CAS numbers against the active dataset.
// ──────────────────────────────────────────────────────────────
restrictedRouter.post(
  "/check",
  async (req, res) => {
    try {
      const { casNumbers } = req.body as { casNumbers?: string[] };
      if (!casNumbers || !Array.isArray(casNumbers) || casNumbers.length === 0) {
        res.status(400).json({
          code: "VALIDATION",
          message: "Request body must contain a 'casNumbers' array.",
        });
        return;
      }

      const result = await checkCasNumbers(casNumbers);
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "NO_ACTIVE_DATASET") {
        res.status(400).json({
          code: "NO_ACTIVE_DATASET",
          message: "No active restricted chemical dataset. Upload an evidence pack first.",
        });
        return;
      }
      throw err;
    }
  },
);

// ──────────────────────────────────────────────────────────────
// POST /restricted/datasets/:id/archive
// Archive a specific dataset.
// ──────────────────────────────────────────────────────────────
restrictedRouter.post(
  "/datasets/:id/archive",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      await archiveDataset(req.params.id as string);

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "RESTRICTED_DATASET_ARCHIVED",
        entityType: "evidence_source",
        entityId: req.params.id as string,
        requestId: req.requestId,
        ip: (Array.isArray(req.ip) ? req.ip[0] : req.ip) ?? undefined,
        userAgent: Array.isArray(req.headers["user-agent"])
          ? req.headers["user-agent"][0]
          : req.headers["user-agent"],
      });

      res.json({ success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(404).json({ code: "NOT_FOUND", message: msg });
    }
  },
);

// ══════════════════════════════════════════════════════════════
// Restricted Chemical Report Exports (Excel + PDF)
// ══════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────
// GET /restricted/report.xlsx?productId=
// Download restricted chemicals report as Excel
// ──────────────────────────────────────────────────────────────
restrictedRouter.get("/report.xlsx", async (req, res) => {
  const productId = req.query.productId as string | undefined;
  if (!productId) {
    res.status(400).json({ code: "VALIDATION", message: "productId query parameter required." });
    return;
  }

  try {
    const reportData = await buildRestrictedReportData(productId);

    logger.info({
      event: "RESTRICTED_REPORT_EXPORT",
      productId,
      format: "xlsx",
      hits: reportData.hits.length,
    });

    await writeAuditLog({
      actorUserId: req.auth!.userId,
      action: "RESTRICTED_REPORT_EXPORTED",
      entityType: "product",
      entityId: productId,
      requestId: req.requestId,
      ip: (Array.isArray(req.ip) ? req.ip[0] : req.ip) ?? undefined,
      userAgent: Array.isArray(req.headers["user-agent"])
        ? req.headers["user-agent"][0]
        : req.headers["user-agent"],
      metadata: { productId, format: "xlsx", hitsCount: reportData.hits.length },
    });

    const buffer = await generateRestrictedExcelReport(reportData);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `restricted-report-${reportData.summary.skuCode}-${date}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "PRODUCT_NOT_FOUND") {
      res.status(404).json({ code: "NOT_FOUND", message: "Product not found" });
      return;
    }
    if (msg === "NO_UPLOAD") {
      res.status(400).json({ code: "NO_UPLOAD", message: "Product has no formulation upload." });
      return;
    }
    if (msg === "NO_ACTIVE_DATASET") {
      res.status(400).json({ code: "NO_ACTIVE_DATASET", message: "No active restricted chemical dataset." });
      return;
    }
    throw err;
  }
});

// ──────────────────────────────────────────────────────────────
// GET /restricted/report.pdf?productId=
// Download restricted chemicals report as PDF
// ──────────────────────────────────────────────────────────────
restrictedRouter.get("/report.pdf", async (req, res) => {
  const productId = req.query.productId as string | undefined;
  if (!productId) {
    res.status(400).json({ code: "VALIDATION", message: "productId query parameter required." });
    return;
  }

  try {
    const reportData = await buildRestrictedReportData(productId);

    logger.info({
      event: "RESTRICTED_REPORT_EXPORT",
      productId,
      format: "pdf",
      hits: reportData.hits.length,
    });

    await writeAuditLog({
      actorUserId: req.auth!.userId,
      action: "RESTRICTED_REPORT_EXPORTED",
      entityType: "product",
      entityId: productId,
      requestId: req.requestId,
      ip: (Array.isArray(req.ip) ? req.ip[0] : req.ip) ?? undefined,
      userAgent: Array.isArray(req.headers["user-agent"])
        ? req.headers["user-agent"][0]
        : req.headers["user-agent"],
      metadata: { productId, format: "pdf", hitsCount: reportData.hits.length },
    });

    const buffer = await generateRestrictedPdfReport(reportData);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `restricted-report-${reportData.summary.skuCode}-${date}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "PRODUCT_NOT_FOUND") {
      res.status(404).json({ code: "NOT_FOUND", message: "Product not found" });
      return;
    }
    if (msg === "NO_UPLOAD") {
      res.status(400).json({ code: "NO_UPLOAD", message: "Product has no formulation upload." });
      return;
    }
    if (msg === "NO_ACTIVE_DATASET") {
      res.status(400).json({ code: "NO_ACTIVE_DATASET", message: "No active restricted chemical dataset." });
      return;
    }
    throw err;
  }
});
