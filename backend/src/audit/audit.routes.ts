import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { prisma } from "../prisma.js";

export const auditRouter = Router();

auditRouter.use(requireAuth);

// GET /audit-logs — list audit logs (Admin or Compliance Officer / compliance:read)
// Query: from?, to?, actorUserId?, entityType?, action?, limit? (default 100, max 500), cursor?
auditRouter.get("/audit-logs", requireRole("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const actorUserId = req.query.actorUserId as string | undefined;
  const entityType = req.query.entityType as string | undefined;
  const action = req.query.action as string | undefined;
  const limitRaw = req.query.limit as string | undefined;
  const limit = Math.min(500, Math.max(1, parseInt(limitRaw ?? "100", 10) || 100));
  const cursor = req.query.cursor as string | undefined;

  const where: Parameters<typeof prisma.auditLog.findMany>[0]["where"] = {};

  if (from || to) {
    where.at = {};
    if (from) where.at.gte = new Date(from);
    if (to) where.at.lte = new Date(to);
  }
  if (actorUserId) where.actorUserId = actorUserId;
  if (entityType) where.entityType = entityType;
  if (action) where.action = action;

  const logs = await prisma.auditLog.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { at: "desc" },
    include: {
      actor: { select: { id: true, email: true, fullName: true } },
    },
  });

  const hasMore = logs.length > limit;
  const items = hasMore ? logs.slice(0, limit) : logs;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  res.json({
    logs: items,
    nextCursor,
    hasMore,
  });
});
