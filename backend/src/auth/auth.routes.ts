import { Router } from "express";
import { prisma } from "../prisma.js";
import { validateEmailDomain } from "../env.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { writeAuditLog } from "../audit/audit.service.js";
import {
  verifyPassword,
  hashPassword,
  isBcryptHash,
  signAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeRefreshTokenById,
  toPublicUser,
} from "./auth.service.js";
import type { LoginBody, RefreshBody, LogoutBody } from "./auth.types.js";

export const authRouter = Router();

// POST /auth/login
authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body as LoginBody;

  if (!email || !password) {
    res.status(400).json({ code: "VALIDATION", message: "Email and password required" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  if (!validateEmailDomain(normalizedEmail)) {
    await writeAuditLog({
      action: "AUTH_LOGIN_FAIL",
      entityType: "auth",
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { email: normalizedEmail, reason: "invalid_domain" },
    });
    res.status(403).json({ code: "DOMAIN_REJECTED", message: `Only @thelunivaaqgroup.com accounts allowed` });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user) {
    await writeAuditLog({
      action: "AUTH_LOGIN_FAIL",
      entityType: "auth",
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { email: normalizedEmail, reason: "not_found" },
    });
    res.status(401).json({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });
    return;
  }

  if (!user.isActive) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "AUTH_LOGIN_FAIL",
      entityType: "auth",
      entityId: user.id,
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { reason: "deactivated" },
    });
    res.status(403).json({ code: "DEACTIVATED", message: "Account is deactivated" });
    return;
  }

  // ── Auto-repair: detect legacy plaintext passwordHash and migrate in-place ──
  let valid: boolean;

  if (isBcryptHash(user.passwordHash)) {
    // Normal path: compare against bcrypt hash
    valid = await verifyPassword(password, user.passwordHash);
  } else {
    // Legacy path: passwordHash is stored as plaintext (not hashed)
    // Compare directly, and if it matches, hash and update the DB
    if (user.passwordHash === password) {
      valid = true;
      const newHash = await hashPassword(password);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      });
      await writeAuditLog({
        actorUserId: user.id,
        action: "USER_PASSWORD_LEGACY_MIGRATED",
        entityType: "user",
        entityId: user.id,
        requestId: req.requestId,
        ip: (Array.isArray(req.ip) ? req.ip[0] : req.ip) ?? undefined,
        userAgent: Array.isArray(req.headers["user-agent"]) ? req.headers["user-agent"][0] : req.headers["user-agent"],
        metadata: { reason: "plaintext_password_auto_hashed" },
      });
    } else {
      valid = false;
    }
  }

  if (!valid) {
    await writeAuditLog({
      actorUserId: user.id,
      action: "AUTH_LOGIN_FAIL",
      entityType: "auth",
      entityId: user.id,
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { reason: "bad_password" },
    });
    res.status(401).json({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const accessToken = signAccessToken(user);
  const refreshToken = await createRefreshToken(user.id);

  await writeAuditLog({
    actorUserId: user.id,
    action: "AUTH_LOGIN_SUCCESS",
    entityType: "auth",
    entityId: user.id,
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: {},
  });

  res.json({ accessToken, refreshToken, user: toPublicUser(user) });
});

// GET /auth/me
authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.auth });
});

// POST /auth/refresh
authRouter.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body as RefreshBody;

  if (!refreshToken) {
    res.status(400).json({ code: "VALIDATION", message: "refreshToken required" });
    return;
  }

  const result = await verifyRefreshToken(refreshToken);
  if (!result) {
    res.status(401).json({ code: "INVALID_TOKEN", message: "Invalid or expired refresh token" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: result.userId } });
  if (!user || !user.isActive) {
    res.status(401).json({ code: "UNAUTHORIZED", message: "Account not active" });
    return;
  }

  // Rotate: revoke old, issue new
  await revokeRefreshTokenById(result.tokenId);
  const newAccessToken = signAccessToken(user);
  const newRefreshToken = await createRefreshToken(user.id);

  res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken, user: toPublicUser(user) });
});

// POST /auth/logout
authRouter.post("/logout", async (req, res) => {
  const { refreshToken } = req.body as LogoutBody;

  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }

  await writeAuditLog({
    actorUserId: req.auth?.userId ?? null,
    action: "AUTH_LOGOUT",
    entityType: "auth",
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: {},
  });

  res.json({ message: "Logged out" });
});
