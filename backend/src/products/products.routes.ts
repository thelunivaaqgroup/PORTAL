import { Router } from "express";
import multer from "multer";
import { join } from "node:path";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { prisma } from "../prisma.js";
import { logger } from "../logger.js";
import {
  createProduct,
  listProducts,
  listProductsByRange,
  getProductById,
  updateProduct,
  deleteProduct,
} from "./products.service.js";
import { recomputeProductStage } from "./productStage.service.js";
import {
  createUploadWithExtraction,
  listUploadsByProduct,
  getLatestUploadByProduct,
  getUploadByIdForProduct,
  manualMatchRow,
  replaceFormulation,
  getActiveUploadForProduct,
  getArchivedUploadsForProduct,
} from "../uploads/uploads.service.js";
import type { CreateProductBody, UpdateProductBody } from "./products.types.js";

// ── Multer setup ──
const STORAGE_DIR = join(process.cwd(), "storage", "uploads");

const formulationUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, STORAGE_DIR),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const ext = file.originalname.split(".").pop() || "bin";
      cb(null, `${unique}.${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
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

export const productsRouter = Router();

productsRouter.use(requireAuth);

// ──────────────────────────────────────────────────────────────
// POST /products
// ──────────────────────────────────────────────────────────────
productsRouter.post(
  "/",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const body = req.body as CreateProductBody;

    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      res.status(400).json({ code: "VALIDATION", message: "name is required" });
      return;
    }
    if (!body.rangeId || typeof body.rangeId !== "string") {
      res.status(400).json({ code: "VALIDATION", message: "rangeId is required" });
      return;
    }
    if (!Array.isArray(body.targetRegions) || body.targetRegions.length === 0) {
      res.status(400).json({ code: "VALIDATION", message: "targetRegions must be a non-empty array" });
      return;
    }

    try {
      const product = await createProduct(body, req.auth!.userId);

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "PRODUCT_CREATED",
        entityType: "product",
        entityId: product.id,
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { name: product.name, skuCode: product.skuCode, rangeId: body.rangeId },
      });

      res.status(201).json({ product });
    } catch (err) {
      if (err instanceof Error && err.message === "RANGE_NOT_FOUND") {
        res.status(404).json({ code: "RANGE_NOT_FOUND", message: "Range not found" });
        return;
      }
      throw err;
    }
  },
);

// ──────────────────────────────────────────────────────────────
// GET /products
// ──────────────────────────────────────────────────────────────
productsRouter.get("/", async (req, res) => {
  const rangeId = req.query.rangeId as string | undefined;
  const raw = rangeId ? await listProductsByRange(rangeId) : await listProducts();

  const products = raw.map((p) => ({
    ...p,
    hasDatasheetUpload: !!p.latestUploadId,
  }));

  res.json({ products });
});

// ──────────────────────────────────────────────────────────────
// GET /products/:id
// ──────────────────────────────────────────────────────────────
productsRouter.get("/:id", async (req, res) => {
  const product = await getProductById(req.params.id as string);
  if (!product) {
    res.status(404).json({ code: "NOT_FOUND", message: "Product not found" });
    return;
  }

  const hasDatasheetUpload = !!product.latestUploadId;

  res.json({ product: { ...product, hasDatasheetUpload } });
});

// ──────────────────────────────────────────────────────────────
// PATCH /products/:id
// ──────────────────────────────────────────────────────────────
productsRouter.patch(
  "/:id",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const body = req.body as UpdateProductBody;
    const id = req.params.id as string;

    const existing = await getProductById(id);
    if (!existing) {
      res.status(404).json({ code: "NOT_FOUND", message: "Product not found" });
      return;
    }

    try {
      const product = await updateProduct(id, body);

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "PRODUCT_UPDATED",
        entityType: "product",
        entityId: id,
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: body,
      });

      res.json({ product });
    } catch (err) {
      if (err instanceof Error && err.message === "RANGE_NOT_FOUND") {
        res.status(404).json({ code: "RANGE_NOT_FOUND", message: "Range not found" });
        return;
      }
      throw err;
    }
  },
);

// ──────────────────────────────────────────────────────────────
// DELETE /products/:id — SUPER_ADMIN only
// ──────────────────────────────────────────────────────────────
productsRouter.delete(
  "/:id",
  requireRole("SUPER_ADMIN"),
  async (req, res) => {
    const id = req.params.id as string;

    const existing = await getProductById(id);
    if (!existing) {
      res.status(404).json({ code: "NOT_FOUND", message: "Product not found" });
      return;
    }

    await deleteProduct(id);

    await writeAuditLog({
      actorUserId: req.auth!.userId,
      action: "PRODUCT_DELETED",
      entityType: "product",
      entityId: id,
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { name: existing.name, skuCode: existing.skuCode },
    });

    res.json({ ok: true });
  },
);

// ──────────────────────────────────────────────────────────────
// POST /products/:productId/formulations/upload
// Upload file to product's active formulation + run extraction
// ──────────────────────────────────────────────────────────────
productsRouter.post(
  "/:productId/formulations/upload",
  requireRole("SUPER_ADMIN", "ADMIN"),
  formulationUpload.single("file"),
  async (req, res) => {
    const productId = req.params.productId as string;
    const userId = req.auth!.userId;

    // A) Load product by productId — include activeFormulationId
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, skuCode: true, activeFormulationId: true },
    });
    if (!product) {
      res.status(404).json({ code: "PRODUCT_NOT_FOUND", message: "Product not found" });
      return;
    }

    // B) Auto-create Formulation if product doesn't have one yet
    if (!product.activeFormulationId) {
      logger.info({ event: "auto_create_formulation", productId, skuCode: product.skuCode });

      // Find or create ProductSku from the product's skuCode
      const sku = await prisma.productSku.upsert({
        where: { skuCode: product.skuCode },
        create: { skuCode: product.skuCode, productName: product.name },
        update: {},
      });

      // Create Formulation with draft v1
      const formulation = await prisma.$transaction(async (tx) => {
        const f = await tx.formulation.create({
          data: { skuId: sku.id, createdById: userId },
        });
        const v = await tx.formulationVersion.create({
          data: {
            formulationId: f.id,
            versionNumber: 1,
            status: "DRAFT",
            createdById: userId,
          },
        });
        await tx.formulation.update({
          where: { id: f.id },
          data: { currentVersionId: v.id },
        });
        return f;
      });

      // Link to product
      await prisma.product.update({
        where: { id: productId },
        data: { activeFormulationId: formulation.id },
      });

      product.activeFormulationId = formulation.id;
      logger.info({ event: "formulation_auto_created", productId, formulationId: formulation.id });
    }

    // C) Guard: if an ACTIVE formulation upload already exists, require Replace
    const existingActive = await prisma.formulationUpload.findFirst({
      where: { productId, status: "ACTIVE" },
      select: { id: true, version: true },
    });
    if (existingActive) {
      res.status(409).json({
        code: "ACTIVE_UPLOAD_EXISTS",
        message: "An active formulation upload already exists. Use Replace Formulation to archive it and upload a new one.",
        activeUploadId: existingActive.id,
        activeVersion: existingActive.version,
      });
      return;
    }

    // Validate file
    const file = req.file;
    if (!file) {
      res.status(400).json({
        code: "FILE_REQUIRED",
        message: "file is required (multipart field name: file)",
      });
      return;
    }

    try {
      // C) Run upload + extraction pipeline using EXISTING activeFormulationId
      const result = await createUploadWithExtraction({
        formulationId: product.activeFormulationId,
        productId,
        userId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath: file.path,
      });

      // D) Defensive: re-query upload to confirm existence before returning
      const confirmed = await prisma.formulationUpload.findUnique({
        where: { id: result.upload.id },
        select: { id: true, formulationId: true },
      });
      if (!confirmed) {
        throw new Error("Upload row not found after insert — possible transaction rollback");
      }

      // Recompute product stage
      await recomputeProductStage(productId, userId);

      // Re-fetch product to get updated stage
      const updatedProduct = await prisma.product.findUnique({
        where: { id: productId },
        select: { stage: true },
      });

      await writeAuditLog({
        actorUserId: userId,
        action: "PRODUCT_FORMULATION_UPLOADED",
        entityType: "product",
        entityId: productId,
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          formulationId: product.activeFormulationId,
          uploadId: result.upload.id,
          fileName: file.originalname,
          rowCount: result.rowCount,
          extractionMode: result.extractionMode,
        } as Record<string, unknown>,
      });

      res.status(201).json({
        productId,
        formulationId: product.activeFormulationId,
        uploadId: result.upload.id,
        hasDatasheetUpload: true,
        stage: updatedProduct?.stage ?? "PRE_LIFECYCLE",
        extractedRowCount: result.rowCount,
        extractionMode: result.extractionMode,
        reasonCode: result.reasonCode,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      res.status(422).json({ code: "UPLOAD_FAILED", message });
    }
  },
);

// ──────────────────────────────────────────────────────────────
// POST /products/:productId/formulation/replace
// Archive current active upload + upload new one + reset compliance
// ──────────────────────────────────────────────────────────────
productsRouter.post(
  "/:productId/formulation/replace",
  requireRole("SUPER_ADMIN", "ADMIN"),
  formulationUpload.single("file"),
  async (req, res) => {
    const productId = req.params.productId as string;
    const userId = req.auth!.userId;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, skuCode: true, activeFormulationId: true },
    });
    if (!product) {
      res.status(404).json({ code: "PRODUCT_NOT_FOUND", message: "Product not found" });
      return;
    }
    // Auto-create Formulation if missing (same logic as upload endpoint)
    if (!product.activeFormulationId) {
      const sku = await prisma.productSku.upsert({
        where: { skuCode: product.skuCode },
        create: { skuCode: product.skuCode, productName: product.name },
        update: {},
      });
      const formulation = await prisma.$transaction(async (tx) => {
        const f = await tx.formulation.create({
          data: { skuId: sku.id, createdById: userId },
        });
        const v = await tx.formulationVersion.create({
          data: {
            formulationId: f.id,
            versionNumber: 1,
            status: "DRAFT",
            createdById: userId,
          },
        });
        await tx.formulation.update({
          where: { id: f.id },
          data: { currentVersionId: v.id },
        });
        return f;
      });
      await prisma.product.update({
        where: { id: productId },
        data: { activeFormulationId: formulation.id },
      });
      product.activeFormulationId = formulation.id;
      logger.info({ event: "formulation_auto_created_replace", productId, formulationId: formulation.id });
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ code: "FILE_REQUIRED", message: "file is required (multipart field name: file)" });
      return;
    }

    try {
      const result = await replaceFormulation({
        productId,
        formulationId: product.activeFormulationId,
        userId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath: file.path,
      });

      // Recompute product stage
      await recomputeProductStage(productId, userId);

      const updatedProduct = await prisma.product.findUnique({
        where: { id: productId },
        select: { stage: true },
      });

      await writeAuditLog({
        actorUserId: userId,
        action: "PRODUCT_FORMULATION_REPLACED",
        entityType: "product",
        entityId: productId,
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: {
          formulationId: product.activeFormulationId,
          archivedUploadId: result.archivedUploadId,
          newUploadId: result.newUpload.upload.id,
          previousVersion: result.previousVersion,
          newVersion: result.newVersion,
          fileName: file.originalname,
          rowCount: result.newUpload.rowCount,
        } as Record<string, unknown>,
      });

      res.status(201).json({
        productId,
        formulationId: product.activeFormulationId,
        uploadId: result.newUpload.upload.id,
        hasDatasheetUpload: true,
        stage: updatedProduct?.stage ?? "PRE_LIFECYCLE",
        extractedRowCount: result.newUpload.rowCount,
        extractionMode: result.newUpload.extractionMode,
        reasonCode: result.newUpload.reasonCode,
        previousVersion: result.previousVersion,
        newVersion: result.newVersion,
        archivedUploadId: result.archivedUploadId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Replace failed";
      res.status(422).json({ code: "REPLACE_FAILED", message });
    }
  },
);

// ──────────────────────────────────────────────────────────────
// GET /products/:productId/formulation/history
// Get active + archived formulation uploads for a product
// ──────────────────────────────────────────────────────────────
productsRouter.get("/:productId/formulation/history", async (req, res) => {
  const { productId } = req.params;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) {
    res.status(404).json({ code: "NOT_FOUND", message: "Product not found" });
    return;
  }

  const [active, archived] = await Promise.all([
    getActiveUploadForProduct(productId),
    getArchivedUploadsForProduct(productId),
  ]);

  res.json({ active, archived });
});

// ──────────────────────────────────────────────────────────────
// GET /products/:productId/uploads
// List all uploads for a product (newest first)
// ──────────────────────────────────────────────────────────────
productsRouter.get("/:productId/uploads", async (req, res) => {
  const { productId } = req.params;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) {
    res.status(404).json({ code: "NOT_FOUND", message: "Product not found" });
    return;
  }

  const uploads = await listUploadsByProduct(productId);
  res.json({ uploads });
});

// ──────────────────────────────────────────────────────────────
// GET /products/:productId/uploads/latest
// Get latest upload for a product
// ──────────────────────────────────────────────────────────────
productsRouter.get("/:productId/uploads/latest", async (req, res) => {
  const { productId } = req.params;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) {
    res.status(404).json({ code: "NOT_FOUND", message: "Product not found" });
    return;
  }

  const latest = await getLatestUploadByProduct(productId);
  if (!latest) {
    res.status(404).json({
      code: "NOT_FOUND",
      message: "No uploads found for this product",
    });
    return;
  }

  res.json({ upload: latest });
});

// ──────────────────────────────────────────────────────────────
// GET /products/:productId/uploads/:uploadId
// Get a single upload by ID (scoped to product)
// ──────────────────────────────────────────────────────────────
productsRouter.get("/:productId/uploads/:uploadId", async (req, res) => {
  const { productId, uploadId } = req.params;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) {
    res.status(404).json({ code: "NOT_FOUND", message: "Product not found" });
    return;
  }

  const found = await getUploadByIdForProduct(productId, uploadId);
  if (!found) {
    res.status(404).json({ code: "NOT_FOUND", message: "Upload not found" });
    return;
  }

  res.json({ upload: found });
});

// ──────────────────────────────────────────────────────────────
// PATCH /products/:productId/uploads/rows/:rowId/match
// Manually override matched ingredient for a single row
// ──────────────────────────────────────────────────────────────
productsRouter.patch(
  "/:productId/uploads/rows/:rowId/match",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const productId = req.params.productId as string;
    const rowId = req.params.rowId as string;

    const { ingredientId } = req.body as { ingredientId?: string };
    if (!ingredientId || typeof ingredientId !== "string") {
      res.status(400).json({
        code: "VALIDATION",
        message: "ingredientId is required",
      });
      return;
    }

    // Verify row belongs to an upload for this product
    const row = await prisma.formulationUploadRow.findUnique({
      where: { id: rowId },
      include: { upload: { select: { productId: true } } },
    });
    if (!row || row.upload.productId !== productId) {
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
        ip: req.ip ?? undefined,
        userAgent: req.headers["user-agent"],
        metadata: {
          productId,
          rowId,
          ingredientId,
          rawName: row.rawName,
        } as Record<string, unknown>,
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
