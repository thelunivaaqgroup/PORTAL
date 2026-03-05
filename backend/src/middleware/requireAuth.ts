import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import type { Role } from "@prisma/client";

export type AuthPayload = {
  userId: string;
  email: string;
  role: Role;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ code: "UNAUTHORIZED", message: "Missing or invalid token" });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthPayload;

    prisma.user
      .findUnique({ where: { id: payload.userId } })
      .then((user) => {
        if (!user || !user.isActive) {
          res.status(401).json({ code: "UNAUTHORIZED", message: "Account not active" });
          return;
        }
        req.auth = { userId: user.id, email: user.email, role: user.role };
        next();
      })
      .catch(() => {
        res.status(500).json({ code: "INTERNAL", message: "Auth lookup failed" });
      });
  } catch {
    res.status(401).json({ code: "UNAUTHORIZED", message: "Invalid or expired token" });
  }
}
