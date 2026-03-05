import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { runAlertsAndStageSweep } from "./alerts.service.js";
import type { AlertStatus, AlertType } from "@prisma/client";

export const alertsRouter = Router();

const VALID_STATUSES: AlertStatus[] = ["ACTIVE", "RESOLVED"];
const VALID_TYPES: AlertType[] = [
  "LOW_STOCK",
  "LOT_EXPIRING_SOON",
  "LOT_EXPIRED",
  "DOC_EXPIRING_SOON",
  "DOC_EXPIRED",
];

/* ------------------------------------------------------------------ */
/*  GET /alerts                                                        */
/* ------------------------------------------------------------------ */

alertsRouter.get("/", requireAuth, async (req, res) => {
  try {
    const statusParam = req.query.status as string | undefined;
    const typeParam = req.query.type as string | undefined;

    const where: Record<string, unknown> = {};

    if (statusParam && VALID_STATUSES.includes(statusParam as AlertStatus)) {
      where.status = statusParam;
    }
    if (typeParam && VALID_TYPES.includes(typeParam as AlertType)) {
      where.type = typeParam;
    }

    const alerts = await prisma.systemAlert.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        ingredient: { select: { id: true, inciName: true } },
        lot: { select: { id: true, supplierLotNumber: true } },
        product: { select: { id: true, name: true, skuCode: true } },
        resolvedBy: { select: { id: true, fullName: true } },
      },
    });

    res.json({ alerts });
  } catch (err) {
    res.status(500).json({ code: "INTERNAL", message: "Failed to list alerts" });
  }
});

/* ------------------------------------------------------------------ */
/*  POST /alerts/run                                                   */
/* ------------------------------------------------------------------ */

alertsRouter.post(
  "/run",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      await runAlertsAndStageSweep();

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "ALERTS_SWEEP_RUN",
        entityType: "SystemAlert",
        requestId: (req as any).id ?? "unknown",
      });

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ code: "INTERNAL", message: "Alert sweep failed" });
    }
  },
);

/* ------------------------------------------------------------------ */
/*  POST /alerts/:id/resolve                                           */
/* ------------------------------------------------------------------ */

alertsRouter.post(
  "/:id/resolve",
  requireAuth,
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const alert = await prisma.systemAlert.findUnique({ where: { id } });
      if (!alert) {
        res.status(404).json({ code: "ALERT_NOT_FOUND", message: "Alert not found" });
        return;
      }

      if (alert.status === "RESOLVED") {
        res.status(400).json({ code: "ALREADY_RESOLVED", message: "Alert is already resolved" });
        return;
      }

      const updated = await prisma.systemAlert.update({
        where: { id },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
          resolvedByUserId: req.auth!.userId,
        },
        include: {
          ingredient: { select: { id: true, inciName: true } },
          lot: { select: { id: true, supplierLotNumber: true } },
          product: { select: { id: true, name: true, skuCode: true } },
          resolvedBy: { select: { id: true, fullName: true } },
        },
      });

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "ALERT_RESOLVED",
        entityType: "SystemAlert",
        entityId: id,
        requestId: (req as any).id ?? "unknown",
      });

      res.json({ alert: updated });
    } catch (err) {
      res.status(500).json({ code: "INTERNAL", message: "Failed to resolve alert" });
    }
  },
);
