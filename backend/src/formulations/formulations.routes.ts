import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { writeAuditLog } from "../audit/audit.service.js";
import {
  createFormulationWithDraftV1,
  listFormulations,
  getFormulationById,
  createNextVersion,
} from "./formulations.service.js";
import type { CreateFormulationBody } from "./formulations.types.js";

export const formulationsRouter = Router();

// All formulations routes require auth
formulationsRouter.use(requireAuth);

// POST /formulations — SUPER_ADMIN + ADMIN (auto-creates v1 DRAFT)
formulationsRouter.post("/", requireRole("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  const { skuId } = req.body as CreateFormulationBody;

  if (!skuId) {
    res.status(400).json({ code: "VALIDATION", message: "skuId required" });
    return;
  }

  const sku = await prisma.productSku.findUnique({ where: { id: skuId } });
  if (!sku) {
    res.status(404).json({ code: "NOT_FOUND", message: "SKU not found" });
    return;
  }

  const formulation = await createFormulationWithDraftV1(skuId, req.auth!.userId);

  await writeAuditLog({
    actorUserId: req.auth!.userId,
    action: "FORMULATION_CREATED",
    entityType: "formulation",
    entityId: formulation.id,
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: { skuId },
  });

  res.status(201).json({ formulation });
});

// GET /formulations — all authenticated users
formulationsRouter.get("/", async (_req, res) => {
  const formulations = await listFormulations();
  res.json({ formulations });
});

// GET /formulations/:id — all authenticated users
formulationsRouter.get("/:id", async (req, res) => {
  const formulation = await getFormulationById(req.params.id);

  if (!formulation) {
    res.status(404).json({ code: "NOT_FOUND", message: "Formulation not found" });
    return;
  }

  res.json({ formulation });
});

// POST /formulations/:id/versions — SUPER_ADMIN + ADMIN (creates next version)
formulationsRouter.post("/:id/versions", requireRole("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  const formulation = await prisma.formulation.findUnique({ where: { id: req.params.id } });

  if (!formulation) {
    res.status(404).json({ code: "NOT_FOUND", message: "Formulation not found" });
    return;
  }

  const version = await createNextVersion(formulation.id, req.auth!.userId);

  await writeAuditLog({
    actorUserId: req.auth!.userId,
    action: "FORMULATION_VERSION_CREATED",
    entityType: "formulation_version",
    entityId: version.id,
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: { formulationId: formulation.id, versionNumber: version.versionNumber },
  });

  res.status(201).json({ version });
});
