import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { listLabels, saveLabel, activateLabel } from "./labels.service.js";
import { validateLabel } from "./labelValidation.service.js";
import { recomputeProductStage } from "../products/productStage.service.js";
import type { RegionCode } from "@prisma/client";
import type { SaveLabelBody } from "./labels.types.js";

export const labelsRouter = Router();

labelsRouter.use(requireAuth);

const VALID_REGIONS = ["IN", "AU"];

// ──────────────────────────────────────────────────────────────
// GET /products/:productId/labels?region=IN|AU
// ──────────────────────────────────────────────────────────────
labelsRouter.get("/:productId/labels", async (req, res) => {
  const { productId } = req.params;
  const region = req.query.region as string;

  if (!region || !VALID_REGIONS.includes(region)) {
    res.status(400).json({ code: "VALIDATION", message: "region query param must be IN or AU" });
    return;
  }

  const labels = await listLabels(productId, region as RegionCode);
  const active = labels.find((l) => l.isActive) ?? null;

  res.json({ labels, activeId: active?.id ?? null });
});

// ──────────────────────────────────────────────────────────────
// POST /products/:productId/labels
// Save new label version (auto-versioned, auto-activated)
// ──────────────────────────────────────────────────────────────
labelsRouter.post(
  "/:productId/labels",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const { productId } = req.params;
    const body = req.body as SaveLabelBody;

    if (!body.region || !VALID_REGIONS.includes(body.region)) {
      res.status(400).json({ code: "VALIDATION", message: "region must be IN or AU" });
      return;
    }
    if (!body.productName?.trim()) {
      res.status(400).json({ code: "VALIDATION", message: "productName is required" });
      return;
    }
    if (!body.netQuantity?.trim()) {
      res.status(400).json({ code: "VALIDATION", message: "netQuantity is required" });
      return;
    }
    if (!body.inciDeclaration?.trim()) {
      res.status(400).json({ code: "VALIDATION", message: "inciDeclaration is required" });
      return;
    }

    const label = await saveLabel(productId, body, req.auth!.userId);

    await writeAuditLog({
      actorUserId: req.auth!.userId,
      action: "LABEL_SAVED",
      entityType: "label_metadata",
      entityId: label.id,
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { productId, region: body.region, versionNumber: label.versionNumber },
    });

    // Recompute product stage after label save
    try {
      await recomputeProductStage(productId, req.auth!.userId);
    } catch (_) { /* non-fatal */ }

    res.status(201).json({ label });
  },
);

// ──────────────────────────────────────────────────────────────
// POST /products/:productId/labels/:labelId/activate
// ──────────────────────────────────────────────────────────────
labelsRouter.post(
  "/:productId/labels/:labelId/activate",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const { productId, labelId } = req.params;

    try {
      const label = await activateLabel(labelId as string);

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "LABEL_ACTIVATED",
        entityType: "label_metadata",
        entityId: labelId as string,
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { productId, labelId },
      });

      // Recompute product stage after activation change
      try {
        await recomputeProductStage(productId as string, req.auth!.userId);
      } catch (_) { /* non-fatal */ }

      res.json({ label });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Activation failed";
      if (message === "Label not found") {
        res.status(404).json({ code: "NOT_FOUND", message });
        return;
      }
      res.status(422).json({ code: "ACTIVATION_FAILED", message });
    }
  },
);

// ──────────────────────────────────────────────────────────────
// GET /products/:productId/labels/validate?region=IN|AU
// ──────────────────────────────────────────────────────────────
labelsRouter.get("/:productId/labels/validate", async (req, res) => {
  const { productId } = req.params;
  const region = req.query.region as string;

  if (!region || !VALID_REGIONS.includes(region)) {
    res.status(400).json({ code: "VALIDATION", message: "region query param must be IN or AU" });
    return;
  }

  const result = await validateLabel(productId as string, region as RegionCode);
  res.json(result);
});
