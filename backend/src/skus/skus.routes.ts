import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { createSku, listSkus, findSkuByCode } from "./skus.service.js";
import type { CreateSkuBody } from "./skus.types.js";

export const skusRouter = Router();

// All SKU routes require auth
skusRouter.use(requireAuth);

// POST /skus — SUPER_ADMIN + ADMIN
skusRouter.post("/", requireRole("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  const { skuCode, productName } = req.body as CreateSkuBody;

  if (!skuCode || !productName) {
    res.status(400).json({ code: "VALIDATION", message: "skuCode and productName required" });
    return;
  }

  const existing = await findSkuByCode(skuCode);
  if (existing) {
    res.status(409).json({ code: "DUPLICATE", message: "SKU with this code already exists" });
    return;
  }

  const sku = await createSku(skuCode, productName);

  await writeAuditLog({
    actorUserId: req.auth!.userId,
    action: "SKU_CREATED",
    entityType: "sku",
    entityId: sku.id,
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: { skuCode, productName },
  });

  res.status(201).json({ sku });
});

// GET /skus — all authenticated users
skusRouter.get("/", async (req, res) => {
  const skus = await listSkus();
  res.json({ skus });
});
