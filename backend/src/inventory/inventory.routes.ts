import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { prisma } from "../prisma.js";
import { markExpiredLots } from "./inventory.service.js";
import { scheduleAlertsSweep } from "../alerts/alerts.scheduler.js";

export const inventoryRouter = Router();

inventoryRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB for CSV
});

// ──────────────────────────────────────────────────────────────
// GET /inventory/lots
// ──────────────────────────────────────────────────────────────
inventoryRouter.get(
  "/lots",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (_req, res) => {
    await markExpiredLots();

    const lots = await prisma.rawMaterialLot.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        ingredient: { select: { id: true, inciName: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    res.json({ lots });
  },
);

// ──────────────────────────────────────────────────────────────
// POST /inventory/lots
// ──────────────────────────────────────────────────────────────
inventoryRouter.post(
  "/lots",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const { ingredientId, supplierName, supplierLotNumber, quantityReceivedKg, expiryDate } = req.body;

    if (!ingredientId || !supplierName || !supplierLotNumber) {
      res.status(400).json({ code: "VALIDATION", message: "ingredientId, supplierName, and supplierLotNumber are required" });
      return;
    }

    const qty = Number(quantityReceivedKg);
    if (!qty || qty <= 0) {
      res.status(400).json({ code: "VALIDATION", message: "quantityReceivedKg must be > 0" });
      return;
    }

    // Verify ingredient exists
    const ingredient = await prisma.ingredientMaster.findUnique({ where: { id: ingredientId } });
    if (!ingredient) {
      res.status(404).json({ code: "INGREDIENT_NOT_FOUND", message: "Ingredient not found" });
      return;
    }

    const lot = await prisma.rawMaterialLot.create({
      data: {
        ingredientId,
        supplierName,
        supplierLotNumber,
        quantityReceivedKg: qty,
        quantityRemainingKg: qty,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        status: "AVAILABLE",
        createdByUserId: req.auth!.userId,
      },
      include: {
        ingredient: { select: { id: true, inciName: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    await writeAuditLog({
      actorUserId: req.auth!.userId,
      action: "RAW_LOT_CREATED",
      entityType: "raw_material_lot",
      entityId: lot.id,
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { ingredientId, supplierName, supplierLotNumber, quantityReceivedKg: qty },
    });

    try { scheduleAlertsSweep("inventory_change"); } catch (_) { /* non-fatal */ }

    res.status(201).json({ lot });
  },
);

// ──────────────────────────────────────────────────────────────
// PATCH /inventory/lots/:id
// ──────────────────────────────────────────────────────────────
inventoryRouter.patch(
  "/lots/:id",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const { id } = req.params;

    const existing = await prisma.rawMaterialLot.findUnique({ where: { id: id as string } });
    if (!existing) {
      res.status(404).json({ code: "NOT_FOUND", message: "Lot not found" });
      return;
    }

    const allowed: Record<string, unknown> = {};
    if (req.body.supplierName !== undefined) allowed.supplierName = req.body.supplierName;
    if (req.body.supplierLotNumber !== undefined) allowed.supplierLotNumber = req.body.supplierLotNumber;
    if (req.body.expiryDate !== undefined) allowed.expiryDate = req.body.expiryDate ? new Date(req.body.expiryDate) : null;
    if (req.body.status !== undefined) {
      if (!["AVAILABLE", "BLOCKED"].includes(req.body.status)) {
        res.status(400).json({ code: "VALIDATION", message: "status must be AVAILABLE or BLOCKED" });
        return;
      }
      allowed.status = req.body.status;
    }

    if (Object.keys(allowed).length === 0) {
      res.status(400).json({ code: "VALIDATION", message: "No editable fields provided" });
      return;
    }

    const lot = await prisma.rawMaterialLot.update({
      where: { id: id as string },
      data: allowed,
      include: {
        ingredient: { select: { id: true, inciName: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    await writeAuditLog({
      actorUserId: req.auth!.userId,
      action: "RAW_LOT_UPDATED",
      entityType: "raw_material_lot",
      entityId: lot.id,
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { updatedFields: Object.keys(allowed) },
    });

    try { scheduleAlertsSweep("inventory_change"); } catch (_) { /* non-fatal */ }

    res.json({ lot });
  },
);

// ──────────────────────────────────────────────────────────────
// DELETE /inventory/lots/:id
// ──────────────────────────────────────────────────────────────
inventoryRouter.delete(
  "/lots/:id",
  requireRole("SUPER_ADMIN"),
  async (req, res) => {
    const { id } = req.params;

    const existing = await prisma.rawMaterialLot.findUnique({ where: { id: id as string } });
    if (!existing) {
      res.status(404).json({ code: "NOT_FOUND", message: "Lot not found" });
      return;
    }

    if (existing.quantityRemainingKg !== existing.quantityReceivedKg) {
      res.status(400).json({
        code: "LOT_ALREADY_CONSUMED",
        message: "Cannot delete lot — stock has already been consumed",
      });
      return;
    }

    await prisma.rawMaterialLot.delete({ where: { id: id as string } });

    await writeAuditLog({
      actorUserId: req.auth!.userId,
      action: "RAW_LOT_DELETED",
      entityType: "raw_material_lot",
      entityId: id as string,
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {},
    });

    try { scheduleAlertsSweep("inventory_change"); } catch (_) { /* non-fatal */ }

    res.status(204).end();
  },
);

// ──────────────────────────────────────────────────────────────
// POST /inventory/lots/bulk (CSV upload)
// ──────────────────────────────────────────────────────────────
inventoryRouter.post(
  "/lots/bulk",
  requireRole("SUPER_ADMIN", "ADMIN"),
  upload.single("file"),
  async (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ code: "VALIDATION", message: "file is required" });
      return;
    }

    const csvText = file.buffer.toString("utf-8").trim();
    const lines = csvText.split(/\r?\n/);

    if (lines.length < 2) {
      res.status(400).json({ code: "CSV_INVALID", message: "CSV must have a header row and at least one data row" });
      return;
    }

    // Parse header
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const colMap = {
      inciName: header.indexOf("ingredientinciname"),
      supplier: header.indexOf("suppliername"),
      lotNumber: header.indexOf("supplierlotnumber"),
      qty: header.indexOf("quantitykg"),
      expiry: header.indexOf("expirydate"),
    };

    if (colMap.inciName === -1 || colMap.supplier === -1 || colMap.lotNumber === -1 || colMap.qty === -1) {
      res.status(400).json({
        code: "CSV_INVALID",
        message: "CSV must have columns: IngredientInciName, SupplierName, SupplierLotNumber, QuantityKg",
      });
      return;
    }

    // Pre-load all ingredients for matching
    const allIngredients = await prisma.ingredientMaster.findMany({
      select: { id: true, inciName: true },
    });
    const ingredientMap = new Map(allIngredients.map((i) => [i.inciName.toLowerCase(), i.id]));

    let createdCount = 0;
    const failures: Array<{ rowNumber: number; reason: string }> = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(",").map((c) => c.trim());
      const rowNumber = i + 1;

      const inciName = cols[colMap.inciName] ?? "";
      const supplierName = cols[colMap.supplier] ?? "";
      const supplierLotNumber = cols[colMap.lotNumber] ?? "";
      const qtyStr = cols[colMap.qty] ?? "";
      const expiryStr = colMap.expiry !== -1 ? (cols[colMap.expiry] ?? "") : "";

      if (!inciName || !supplierName || !supplierLotNumber) {
        failures.push({ rowNumber, reason: "Missing required field(s)" });
        continue;
      }

      const qty = Number(qtyStr);
      if (!qty || qty <= 0) {
        failures.push({ rowNumber, reason: `Invalid quantity: ${qtyStr}` });
        continue;
      }

      const ingredientId = ingredientMap.get(inciName.toLowerCase());
      if (!ingredientId) {
        failures.push({ rowNumber, reason: `Ingredient not found: ${inciName}` });
        continue;
      }

      let expiryDate: Date | null = null;
      if (expiryStr) {
        const parsed = new Date(expiryStr);
        if (isNaN(parsed.getTime())) {
          failures.push({ rowNumber, reason: `Invalid expiry date: ${expiryStr}` });
          continue;
        }
        expiryDate = parsed;
      }

      await prisma.rawMaterialLot.create({
        data: {
          ingredientId,
          supplierName,
          supplierLotNumber,
          quantityReceivedKg: qty,
          quantityRemainingKg: qty,
          expiryDate,
          status: "AVAILABLE",
          createdByUserId: req.auth!.userId,
        },
      });

      createdCount++;
    }

    await writeAuditLog({
      actorUserId: req.auth!.userId,
      action: "RAW_LOT_BULK_UPLOADED",
      entityType: "raw_material_lot",
      entityId: null,
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { createdCount, failedCount: failures.length },
    });

    try { scheduleAlertsSweep("inventory_change"); } catch (_) { /* non-fatal */ }

    res.status(201).json({
      createdCount,
      failedCount: failures.length,
      failures,
    });
  },
);
