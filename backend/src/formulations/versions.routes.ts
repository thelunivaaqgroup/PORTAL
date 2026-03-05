import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { writeAuditLog } from "../audit/audit.service.js";
import {
  getVersionById,
  addIngredient,
  listIngredients,
  addDocument,
  listDocuments,
  submitVersion,
  approveVersion,
  rejectVersion,
  validateVersion,
} from "./formulations.service.js";
import type { AddIngredientBody, AddDocumentBody, RejectVersionBody } from "./formulations.types.js";

export const versionsRouter = Router();

// All version routes require auth
versionsRouter.use(requireAuth);

// POST /versions/:versionId/ingredients — ADMIN + SA
versionsRouter.post("/:versionId/ingredients", requireRole("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  const version = await getVersionById(req.params.versionId);

  if (!version) {
    res.status(404).json({ code: "NOT_FOUND", message: "Version not found" });
    return;
  }

  if (version.status === "APPROVED" || version.status === "IN_REVIEW") {
    res.status(400).json({ code: "VERSION_LOCKED", message: "Cannot modify a version that is approved or in review" });
    return;
  }

  const { ingredientName, function: fn, concentrationPct } = req.body as AddIngredientBody;

  if (!ingredientName || !fn || concentrationPct === undefined || concentrationPct === null) {
    res.status(400).json({ code: "VALIDATION", message: "ingredientName, function, and concentrationPct required" });
    return;
  }

  if (typeof concentrationPct !== "number" || concentrationPct < 0 || concentrationPct > 100) {
    res.status(400).json({ code: "VALIDATION", message: "concentrationPct must be a number between 0 and 100" });
    return;
  }

  const ingredient = await addIngredient(version.id, ingredientName, fn, concentrationPct);

  await writeAuditLog({
    actorUserId: req.auth!.userId,
    action: "INGREDIENT_ADDED",
    entityType: "formulation_ingredient",
    entityId: ingredient.id,
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: { versionId: version.id, ingredientName },
  });

  res.status(201).json({ ingredient });
});

// GET /versions/:versionId/ingredients — all authenticated users
versionsRouter.get("/:versionId/ingredients", async (req, res) => {
  const version = await getVersionById(req.params.versionId);

  if (!version) {
    res.status(404).json({ code: "NOT_FOUND", message: "Version not found" });
    return;
  }

  const ingredients = await listIngredients(version.id);
  res.json({ ingredients });
});

// POST /versions/:versionId/documents — ADMIN + SA
versionsRouter.post("/:versionId/documents", requireRole("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  const version = await getVersionById(req.params.versionId);

  if (!version) {
    res.status(404).json({ code: "NOT_FOUND", message: "Version not found" });
    return;
  }

  if (version.status === "APPROVED" || version.status === "IN_REVIEW") {
    res.status(400).json({ code: "VERSION_LOCKED", message: "Cannot modify a version that is approved or in review" });
    return;
  }

  const { type, fileName, url } = req.body as AddDocumentBody;

  if (!type || !fileName || !url) {
    res.status(400).json({ code: "VALIDATION", message: "type, fileName, and url required" });
    return;
  }

  const validTypes = ["MSDS", "COA", "TDS", "SPEC_SHEET", "INGREDIENT_DATASHEET", "OTHER"];
  if (!validTypes.includes(type)) {
    res.status(400).json({ code: "VALIDATION", message: `type must be one of: ${validTypes.join(", ")}` });
    return;
  }

  const document = await addDocument(version.id, type, fileName, url);

  await writeAuditLog({
    actorUserId: req.auth!.userId,
    action: "DOCUMENT_ADDED",
    entityType: "document",
    entityId: document.id,
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: { versionId: version.id, type, fileName },
  });

  res.status(201).json({ document });
});

// GET /versions/:versionId/documents — all authenticated users
versionsRouter.get("/:versionId/documents", async (req, res) => {
  const version = await getVersionById(req.params.versionId);

  if (!version) {
    res.status(404).json({ code: "NOT_FOUND", message: "Version not found" });
    return;
  }

  const documents = await listDocuments(version.id);
  res.json({ documents });
});

// PATCH /versions/:versionId/submit — ADMIN + SA
versionsRouter.patch("/:versionId/submit", requireRole("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  const version = await getVersionById(req.params.versionId);

  if (!version) {
    res.status(404).json({ code: "NOT_FOUND", message: "Version not found" });
    return;
  }

  if (version.status !== "DRAFT" && version.status !== "REJECTED") {
    res.status(400).json({ code: "INVALID_STATUS", message: "Can only submit versions in DRAFT or REJECTED status" });
    return;
  }

  // Stage 3A — run validation gate before submit
  const validation = await validateVersion(version.id);

  await writeAuditLog({
    actorUserId: req.auth!.userId,
    action: "VERSION_VALIDATED",
    entityType: "formulation_version",
    entityId: version.id,
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: {
      formulationId: version.formulationId,
      versionNumber: version.versionNumber,
      totalPct: validation.totalPct.toString(),
      hasDuplicateIngredients: validation.hasDuplicateIngredients,
      missingDocTypes: validation.missingDocTypes,
      validationStatus: validation.validationStatus,
      riskLevel: validation.riskLevel,
    },
  });

  if (validation.validationStatus === "FAIL") {
    await writeAuditLog({
      actorUserId: req.auth!.userId,
      action: "VERSION_SUBMIT_BLOCKED",
      entityType: "formulation_version",
      entityId: version.id,
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        formulationId: version.formulationId,
        versionNumber: version.versionNumber,
        riskLevel: validation.riskLevel,
      },
    });

    res.status(400).json({
      code: "VERSION_VALIDATION_FAILED",
      message: "Version failed validation and cannot be submitted",
      details: {
        totalPct: validation.totalPct.toString(),
        hasDuplicateIngredients: validation.hasDuplicateIngredients,
        missingDocTypes: validation.missingDocTypes,
        validationStatus: validation.validationStatus,
        riskLevel: validation.riskLevel,
      },
    });
    return;
  }

  const updated = await submitVersion(version.id, req.auth!.userId);

  await writeAuditLog({
    actorUserId: req.auth!.userId,
    action: "VERSION_SUBMITTED",
    entityType: "formulation_version",
    entityId: version.id,
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: { formulationId: version.formulationId, versionNumber: version.versionNumber },
  });

  res.json({ version: updated });
});

// PATCH /versions/:versionId/approve — SUPER_ADMIN + ADMIN
versionsRouter.patch("/:versionId/approve", requireRole("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  const version = await getVersionById(req.params.versionId);

  if (!version) {
    res.status(404).json({ code: "NOT_FOUND", message: "Version not found" });
    return;
  }

  if (version.status !== "IN_REVIEW") {
    res.status(400).json({ code: "INVALID_STATUS", message: "Can only approve versions in IN_REVIEW status" });
    return;
  }

  const updated = await approveVersion(version.id, req.auth!.userId);

  await writeAuditLog({
    actorUserId: req.auth!.userId,
    action: "VERSION_APPROVED",
    entityType: "formulation_version",
    entityId: version.id,
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: { formulationId: version.formulationId, versionNumber: version.versionNumber },
  });

  res.json({ version: updated });
});

// PATCH /versions/:versionId/reject — SUPER_ADMIN + ADMIN
versionsRouter.patch("/:versionId/reject", requireRole("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  const version = await getVersionById(req.params.versionId);

  if (!version) {
    res.status(404).json({ code: "NOT_FOUND", message: "Version not found" });
    return;
  }

  if (version.status !== "IN_REVIEW") {
    res.status(400).json({ code: "INVALID_STATUS", message: "Can only reject versions in IN_REVIEW status" });
    return;
  }

  const { reason } = req.body as RejectVersionBody;

  if (!reason) {
    res.status(400).json({ code: "VALIDATION", message: "reason required" });
    return;
  }

  const updated = await rejectVersion(version.id, req.auth!.userId, reason);

  await writeAuditLog({
    actorUserId: req.auth!.userId,
    action: "VERSION_REJECTED",
    entityType: "formulation_version",
    entityId: version.id,
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: { formulationId: version.formulationId, versionNumber: version.versionNumber, reason },
  });

  res.json({ version: updated });
});
