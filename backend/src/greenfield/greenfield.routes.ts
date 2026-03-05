import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { writeAuditLog } from "../audit/audit.service.js";
import {
  listGreenfield,
  getGreenfieldById,
  createGreenfield,
  updateGreenfield,
  markReady,
  archiveGreenfield,
  convertGreenfield,
} from "./greenfield.service.js";
import type { CreateGreenfieldBody, UpdateGreenfieldBody, ConvertGreenfieldBody } from "./greenfield.types.js";

export const greenfieldRouter = Router();

greenfieldRouter.use(requireAuth);

// GET /greenfield — all authenticated users
greenfieldRouter.get("/", async (_req, res) => {
  const ideas = await listGreenfield();
  res.json({ ideas });
});

// GET /greenfield/:id — all authenticated users
greenfieldRouter.get("/:id", async (req, res) => {
  const idea = await getGreenfieldById(req.params.id);
  if (!idea) {
    res.status(404).json({ code: "NOT_FOUND", message: "Greenfield idea not found" });
    return;
  }
  res.json({ idea });
});

// POST /greenfield — ADMIN + SUPER_ADMIN
greenfieldRouter.post("/", requireRole("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  const body = req.body as CreateGreenfieldBody;

  if (!body.title || !body.title.trim()) {
    res.status(400).json({ code: "VALIDATION", message: "title is required" });
    return;
  }

  const idea = await createGreenfield(
    { ...body, title: body.title.trim() },
    req.auth!.userId,
  );

  await writeAuditLog({
    actorUserId: req.auth!.userId,
    action: "GREENFIELD_CREATED",
    entityType: "greenfield_idea",
    entityId: idea.id,
    requestId: req.requestId,
    ip: req.ip as string | undefined,
    userAgent: req.headers["user-agent"] as string | undefined,
    metadata: { title: idea.title },
  });

  res.status(201).json({ idea });
});

// PATCH /greenfield/:id — ADMIN + SUPER_ADMIN
greenfieldRouter.patch("/:id", requireRole("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  const body = req.body as UpdateGreenfieldBody;

  const existing = await getGreenfieldById(req.params.id);
  if (!existing) {
    res.status(404).json({ code: "NOT_FOUND", message: "Greenfield idea not found" });
    return;
  }

  if (existing.status === "CONVERTED") {
    res.status(400).json({ code: "ALREADY_CONVERTED", message: "Cannot edit a converted idea" });
    return;
  }

  if (body.title !== undefined && !body.title.trim()) {
    res.status(400).json({ code: "VALIDATION", message: "title cannot be empty" });
    return;
  }

  const idea = await updateGreenfield(req.params.id, body);

  await writeAuditLog({
    actorUserId: req.auth!.userId,
    action: "GREENFIELD_UPDATED",
    entityType: "greenfield_idea",
    entityId: idea.id,
    requestId: req.requestId,
    ip: req.ip as string | undefined,
    userAgent: req.headers["user-agent"] as string | undefined,
  });

  res.json({ idea });
});

// POST /greenfield/:id/mark-ready — ADMIN + SUPER_ADMIN
greenfieldRouter.post("/:id/mark-ready", requireRole("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  const existing = await getGreenfieldById(req.params.id);
  if (!existing) {
    res.status(404).json({ code: "NOT_FOUND", message: "Greenfield idea not found" });
    return;
  }

  if (existing.status !== "DRAFT") {
    res.status(400).json({
      code: "INVALID_STATUS",
      message: `Cannot mark as ready from status ${existing.status}`,
    });
    return;
  }

  const idea = await markReady(req.params.id);

  await writeAuditLog({
    actorUserId: req.auth!.userId,
    action: "GREENFIELD_MARKED_READY",
    entityType: "greenfield_idea",
    entityId: idea.id,
    requestId: req.requestId,
    ip: req.ip as string | undefined,
    userAgent: req.headers["user-agent"] as string | undefined,
  });

  res.json({ idea });
});

// POST /greenfield/:id/convert — ADMIN + SUPER_ADMIN
greenfieldRouter.post("/:id/convert", requireRole("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  const body = req.body as ConvertGreenfieldBody;

  if (!body.productName || !body.productName.trim()) {
    res.status(400).json({ code: "VALIDATION", message: "productName is required" });
    return;
  }
  if (!body.rangeId) {
    res.status(400).json({ code: "VALIDATION", message: "rangeId is required" });
    return;
  }

  const existing = await getGreenfieldById(req.params.id);
  if (!existing) {
    res.status(404).json({ code: "NOT_FOUND", message: "Greenfield idea not found" });
    return;
  }

  if (existing.status === "CONVERTED") {
    res.status(400).json({ code: "ALREADY_CONVERTED", message: "Idea already converted" });
    return;
  }

  try {
    const { idea, product } = await convertGreenfield(
      req.params.id,
      { ...body, productName: body.productName.trim() },
      req.auth!.userId,
    );

    await writeAuditLog({
      actorUserId: req.auth!.userId,
      action: "GREENFIELD_CONVERTED",
      entityType: "greenfield_idea",
      entityId: idea.id,
      requestId: req.requestId,
      ip: req.ip as string | undefined,
      userAgent: req.headers["user-agent"] as string | undefined,
      metadata: { productId: product.id, productName: product.name },
    });

    res.json({ idea, product });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "RANGE_NOT_FOUND") {
      res.status(400).json({ code: "RANGE_NOT_FOUND", message: "Range not found" });
      return;
    }
    throw err;
  }
});

// POST /greenfield/:id/archive — ADMIN + SUPER_ADMIN
greenfieldRouter.post("/:id/archive", requireRole("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  const existing = await getGreenfieldById(req.params.id);
  if (!existing) {
    res.status(404).json({ code: "NOT_FOUND", message: "Greenfield idea not found" });
    return;
  }

  if (existing.status === "CONVERTED") {
    res.status(400).json({ code: "ALREADY_CONVERTED", message: "Cannot archive a converted idea" });
    return;
  }

  const idea = await archiveGreenfield(req.params.id);

  await writeAuditLog({
    actorUserId: req.auth!.userId,
    action: "GREENFIELD_ARCHIVED",
    entityType: "greenfield_idea",
    entityId: idea.id,
    requestId: req.requestId,
    ip: req.ip as string | undefined,
    userAgent: req.headers["user-agent"] as string | undefined,
  });

  res.json({ idea });
});
