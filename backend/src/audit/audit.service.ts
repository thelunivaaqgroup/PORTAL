import { prisma } from "../prisma.js";
import { logger } from "../logger.js";

type AuditEntry = {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId: string;
  metadata?: Record<string, unknown>;
};

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        requestId: entry.requestId,
        metadata: entry.metadata ?? {},
      },
    });
  } catch (err) {
    logger.error({ err, entry }, "Failed to write audit log");
  }
}
