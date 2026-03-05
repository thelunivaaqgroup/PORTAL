import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { prisma } from "../prisma.js";
import { calculateMaxProducibleKg } from "../inventory/inventory.service.js";
import { createBatch } from "./batch.service.js";
import { scheduleAlertsSweep } from "../alerts/alerts.scheduler.js";

export const manufacturingRouter = Router();

manufacturingRouter.use(requireAuth);

// ──────────────────────────────────────────────────────────────
// POST /products/:productId/manufacturing/approve
// ──────────────────────────────────────────────────────────────
manufacturingRouter.post(
  "/:productId/manufacturing/approve",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const { productId } = req.params;

    const product = await prisma.product.findUnique({
      where: { id: productId as string },
      select: { id: true, stage: true },
    });

    if (!product) {
      res.status(404).json({ code: "NOT_FOUND", message: "Product not found" });
      return;
    }

    if (product.stage !== "PACKAGING_READY") {
      res.status(400).json({
        code: "INVALID_STAGE",
        message: `Product must be at PACKAGING_READY to approve manufacturing (current: ${product.stage})`,
      });
      return;
    }

    await prisma.$transaction([
      prisma.product.update({
        where: { id: productId as string },
        data: { stage: "MANUFACTURING_APPROVED" },
      }),
      prisma.productStageEvent.create({
        data: {
          productId: productId as string,
          fromStage: "PACKAGING_READY",
          toStage: "MANUFACTURING_APPROVED",
          reason: "Manufacturing approved",
          createdByUserId: req.auth!.userId,
        },
      }),
    ]);

    await writeAuditLog({
      actorUserId: req.auth!.userId,
      action: "MANUFACTURING_APPROVED",
      entityType: "product",
      entityId: productId as string,
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {},
    });

    try { scheduleAlertsSweep("manufacturing_change"); } catch (_) { /* non-fatal */ }

    const updated = await prisma.product.findUnique({
      where: { id: productId as string },
      select: { id: true, stage: true, name: true, skuCode: true },
    });

    res.json({ product: updated });
  },
);

// ──────────────────────────────────────────────────────────────
// GET /products/:productId/batches/max-producible
// ──────────────────────────────────────────────────────────────
manufacturingRouter.get(
  "/:productId/batches/max-producible",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const { productId } = req.params;

    const product = await prisma.product.findUnique({
      where: { id: productId as string },
      select: { activeFormulationId: true },
    });

    if (!product) {
      res.status(404).json({ code: "NOT_FOUND", message: "Product not found" });
      return;
    }

    if (!product.activeFormulationId) {
      res.status(400).json({ code: "VALIDATION", message: "No active formulation set" });
      return;
    }

    const maxProducibleKg = await calculateMaxProducibleKg(product.activeFormulationId);

    res.json({ maxProducibleKg });
  },
);

// ──────────────────────────────────────────────────────────────
// POST /products/:productId/batches
// ──────────────────────────────────────────────────────────────
manufacturingRouter.post(
  "/:productId/batches",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const { productId } = req.params;
    const { productionQuantityKg } = req.body;

    const qty = Number(productionQuantityKg);
    if (!qty || qty <= 0) {
      res.status(400).json({ code: "VALIDATION", message: "productionQuantityKg must be > 0" });
      return;
    }

    try {
      const batch = await createBatch({
        productId: productId as string,
        productionQuantityKg: qty,
        createdByUserId: req.auth!.userId,
      });

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "BATCH_CREATED",
        entityType: "batch",
        entityId: batch!.id,
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { productId, batchNumber: batch!.batchNumber, productionQuantityKg: qty },
      });

      try { scheduleAlertsSweep("manufacturing_change"); } catch (_) { /* non-fatal */ }

      res.status(201).json({ batch });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Batch creation failed";
      const codeMap: Record<string, number> = {
        PRODUCT_NOT_FOUND: 404,
        INVALID_STAGE: 400,
        NO_ACTIVE_FORMULATION: 400,
        NO_UPLOAD_FOUND: 400,
        NO_INGREDIENTS_FOUND: 400,
        EXCEEDS_MAX_PRODUCTION: 400,
        NO_ACTIVE_LABEL: 400,
        NO_FORMULATION_VERSION: 400,
        INSUFFICIENT_STOCK: 400,
      };
      const status = codeMap[message] ?? 422;
      res.status(status).json({ code: message, message: humanMessage(message) });
    }
  },
);

// ──────────────────────────────────────────────────────────────
// GET /products/:productId/batches
// ──────────────────────────────────────────────────────────────
manufacturingRouter.get(
  "/:productId/batches",
  async (req, res) => {
    const { productId } = req.params;

    const batches = await prisma.batch.findMany({
      where: { productId: productId as string },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        formulationVersion: {
          select: { id: true, versionNumber: true },
        },
      },
    });

    res.json({ batches });
  },
);

// ──────────────────────────────────────────────────────────────
// POST /products/:productId/batches/:batchId/release
// ──────────────────────────────────────────────────────────────
manufacturingRouter.post(
  "/:productId/batches/:batchId/release",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const { productId, batchId } = req.params;

    const batch = await prisma.batch.findUnique({
      where: { id: batchId as string },
      select: { id: true, status: true, batchNumber: true, productId: true },
    });

    if (!batch) {
      res.status(404).json({ code: "NOT_FOUND", message: "Batch not found" });
      return;
    }

    if (batch.productId !== productId) {
      res.status(404).json({ code: "NOT_FOUND", message: "Batch not found for this product" });
      return;
    }

    if (batch.status === "RELEASED") {
      res.status(400).json({ code: "ALREADY_RELEASED", message: "Batch is already released" });
      return;
    }

    // Get current product stage
    const product = await prisma.product.findUnique({
      where: { id: productId as string },
      select: { stage: true },
    });

    const shouldAdvanceStage = product?.stage === "BATCH_CREATED";

    await prisma.$transaction(async (tx) => {
      await tx.batch.update({
        where: { id: batchId as string },
        data: { status: "RELEASED" },
      });

      if (shouldAdvanceStage) {
        await tx.product.update({
          where: { id: productId as string },
          data: { stage: "BATCH_RELEASED" },
        });

        await tx.productStageEvent.create({
          data: {
            productId: productId as string,
            fromStage: "BATCH_CREATED",
            toStage: "BATCH_RELEASED",
            reason: `Batch ${batch.batchNumber} released`,
            createdByUserId: req.auth!.userId,
          },
        });
      }
    });

    await writeAuditLog({
      actorUserId: req.auth!.userId,
      action: "BATCH_RELEASED",
      entityType: "batch",
      entityId: batchId as string,
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { productId, batchNumber: batch.batchNumber },
    });

    try { scheduleAlertsSweep("manufacturing_change"); } catch (_) { /* non-fatal */ }

    const updated = await prisma.batch.findUnique({
      where: { id: batchId as string },
      include: {
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    res.json({ batch: updated });
  },
);

// Helper for human-readable error messages
function humanMessage(code: string): string {
  const map: Record<string, string> = {
    PRODUCT_NOT_FOUND: "Product not found",
    INVALID_STAGE: "Product is not at MANUFACTURING_APPROVED stage",
    NO_ACTIVE_FORMULATION: "No active formulation set on this product",
    NO_UPLOAD_FOUND: "No formulation upload found",
    NO_INGREDIENTS_FOUND: "No matched ingredients found in formulation",
    EXCEEDS_MAX_PRODUCTION: "Requested quantity exceeds maximum producible with current stock",
    NO_ACTIVE_LABEL: "No active label found for this product",
    NO_FORMULATION_VERSION: "No current formulation version found",
    INSUFFICIENT_STOCK: "Insufficient raw material stock for one or more ingredients",
  };
  return map[code] ?? code;
}
