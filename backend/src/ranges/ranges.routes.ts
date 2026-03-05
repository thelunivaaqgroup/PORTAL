import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { writeAuditLog } from "../audit/audit.service.js";
import {
  listRanges,
  createRange,
  findRangeByName,
  updateRange,
  deleteRange,
} from "./ranges.service.js";
import type { CreateRangeBody, UpdateRangeBody } from "./ranges.types.js";

export const rangesRouter = Router();

rangesRouter.use(requireAuth);

// GET /ranges — all authenticated users
rangesRouter.get("/", async (_req, res) => {
  const ranges = await listRanges();
  res.json({ ranges });
});

// POST /ranges — SUPER_ADMIN + ADMIN
rangesRouter.post("/", requireRole("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  const { name } = req.body as CreateRangeBody;

  if (!name || !name.trim()) {
    res.status(400).json({ code: "VALIDATION", message: "name is required" });
    return;
  }

  const existing = await findRangeByName(name.trim());
  if (existing) {
    res.status(409).json({ code: "DUPLICATE", message: "Range with this name already exists" });
    return;
  }

  const range = await createRange(name.trim(), req.auth!.userId);

  await writeAuditLog({
    actorUserId: req.auth!.userId,
    action: "RANGE_CREATED",
    entityType: "product_range",
    entityId: range.id,
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: { name: name.trim() },
  });

  res.status(201).json({ range });
});

// PATCH /ranges/:id — SUPER_ADMIN + ADMIN
rangesRouter.patch("/:id", requireRole("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  const { id } = req.params;
  const { name } = req.body as UpdateRangeBody;

  if (!name || !name.trim()) {
    res.status(400).json({ code: "VALIDATION", message: "name is required" });
    return;
  }

  const existing = await findRangeByName(name.trim());
  if (existing && existing.id !== id) {
    res.status(409).json({ code: "DUPLICATE", message: "Range with this name already exists" });
    return;
  }

  try {
    const range = await updateRange(id, name.trim());

    await writeAuditLog({
      actorUserId: req.auth!.userId,
      action: "RANGE_UPDATED",
      entityType: "product_range",
      entityId: id,
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { name: name.trim() },
    });

    res.json({ range });
  } catch {
    res.status(404).json({ code: "NOT_FOUND", message: "Range not found" });
  }
});

// DELETE /ranges/:id — SUPER_ADMIN only
rangesRouter.delete("/:id", requireRole("SUPER_ADMIN"), async (req, res) => {
  const { id } = req.params;

  try {
    await deleteRange(id);

    await writeAuditLog({
      actorUserId: req.auth!.userId,
      action: "RANGE_DELETED",
      entityType: "product_range",
      entityId: id,
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "RANGE_NOT_EMPTY") {
      res.status(409).json({
        code: "RANGE_NOT_EMPTY",
        message: "Cannot delete a range that contains products",
      });
      return;
    }
    res.status(404).json({ code: "NOT_FOUND", message: "Range not found" });
  }
});
