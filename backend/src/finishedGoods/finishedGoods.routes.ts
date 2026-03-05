import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { prisma } from "../prisma.js";
import {
  setProductPackSpec,
  createFinishedGoodLotForBatch,
} from "./finishedGoods.service.js";

export const finishedGoodsRouter = Router();

finishedGoodsRouter.use(requireAuth);

// ──────────────────────────────────────────────────────────────
// A) PATCH /products/:productId/pack-spec
// ──────────────────────────────────────────────────────────────
finishedGoodsRouter.patch(
  "/:productId/pack-spec",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const { productId } = req.params;
    const { packNetContentMl, fillDensityGPerMl } = req.body;

    if (packNetContentMl === undefined || fillDensityGPerMl === undefined) {
      res.status(400).json({
        code: "VALIDATION",
        message: "packNetContentMl and fillDensityGPerMl are required",
      });
      return;
    }

    try {
      await setProductPackSpec(
        productId as string,
        Number(packNetContentMl),
        Number(fillDensityGPerMl),
        req.auth!.userId,
        req.requestId,
      );

      res.json({
        productId,
        packNetContentMl: Number(packNetContentMl),
        fillDensityGPerMl: Number(fillDensityGPerMl),
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "INTERNAL";
      const statusMap: Record<string, number> = {
        PRODUCT_NOT_FOUND: 404,
        INVALID_PACK_CONTENT: 400,
        INVALID_DENSITY: 400,
      };
      const status = statusMap[code] ?? 500;
      res.status(status).json({ code, message: humanMessage(code) });
    }
  },
);

// ──────────────────────────────────────────────────────────────
// B) POST /products/:productId/batches/:batchId/finished-goods
// ──────────────────────────────────────────────────────────────
finishedGoodsRouter.post(
  "/:productId/batches/:batchId/finished-goods",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const { productId, batchId } = req.params;

    // Ensure batch belongs to this product
    const batch = await prisma.batch.findUnique({
      where: { id: batchId as string },
      select: { productId: true },
    });

    if (!batch) {
      res.status(404).json({ code: "BATCH_NOT_FOUND", message: "Batch not found" });
      return;
    }

    if (batch.productId !== productId) {
      res.status(404).json({
        code: "BATCH_NOT_FOUND",
        message: "Batch not found for this product",
      });
      return;
    }

    try {
      const fgLot = await createFinishedGoodLotForBatch(
        batchId as string,
        req.auth!.userId,
        req.requestId,
      );

      res.status(201).json(fgLot);
    } catch (err) {
      const code = err instanceof Error ? err.message : "INTERNAL";
      const statusMap: Record<string, number> = {
        BATCH_NOT_FOUND: 404,
        BATCH_NOT_RELEASED: 400,
        PACK_SPEC_NOT_SET: 400,
        INVALID_DENSITY: 400,
        FG_LOT_ALREADY_EXISTS: 409,
      };
      const status = statusMap[code] ?? 500;
      res.status(status).json({ code, message: humanMessage(code) });
    }
  },
);

// ──────────────────────────────────────────────────────────────
// C) GET /products/:productId/finished-goods
// ──────────────────────────────────────────────────────────────
finishedGoodsRouter.get(
  "/:productId/finished-goods",
  async (req, res) => {
    const { productId } = req.params;

    const lots = await prisma.finishedGoodLot.findMany({
      where: { productId: productId as string },
      orderBy: { createdAt: "desc" },
      include: {
        batch: {
          select: {
            id: true,
            batchNumber: true,
            status: true,
            productionQuantityKg: true,
            manufacturingDate: true,
            expiryDate: true,
          },
        },
      },
    });

    res.json({ lots });
  },
);

// ──────────────────────────────────────────────────────────────
// D) GET /products/:productId/finished-goods/summary
// ──────────────────────────────────────────────────────────────
finishedGoodsRouter.get(
  "/:productId/finished-goods/summary",
  async (req, res) => {
    const { productId } = req.params;

    const agg = await prisma.finishedGoodLot.aggregate({
      where: { productId: productId as string },
      _sum: {
        unitsProduced: true,
        unitsRemaining: true,
      },
    });

    const availableCount = await prisma.finishedGoodLot.count({
      where: { productId: productId as string, status: "AVAILABLE" },
    });

    res.json({
      productId,
      totalUnitsProduced: agg._sum.unitsProduced ?? 0,
      totalUnitsRemaining: agg._sum.unitsRemaining ?? 0,
      lotsAvailableCount: availableCount,
    });
  },
);

// ── Human-readable error messages ──

function humanMessage(code: string): string {
  const map: Record<string, string> = {
    PRODUCT_NOT_FOUND: "Product not found",
    INVALID_PACK_CONTENT: "packNetContentMl must be a positive integer",
    INVALID_DENSITY: "fillDensityGPerMl must be > 0 and <= 2.0",
    BATCH_NOT_FOUND: "Batch not found",
    BATCH_NOT_RELEASED: "Batch must be RELEASED before creating finished goods",
    PACK_SPEC_NOT_SET: "Product pack spec (packNetContentMl) is not configured",
    FG_LOT_ALREADY_EXISTS: "A finished goods lot already exists for this batch",
  };
  return map[code] ?? code;
}
