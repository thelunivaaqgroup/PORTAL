import type { Request, Response, NextFunction } from "express";
import type { Role } from "@prisma/client";

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Not authenticated" });
      return;
    }

    if (!roles.includes(req.auth.role)) {
      res.status(403).json({ code: "FORBIDDEN", message: "Insufficient permissions" });
      return;
    }

    next();
  };
}

export function canManageTargetRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === "SUPER_ADMIN") {
    return ["ADMIN", "EDITOR", "VIEWER"].includes(targetRole);
  }
  if (actorRole === "ADMIN") {
    return ["EDITOR", "VIEWER"].includes(targetRole);
  }
  return false;
}
