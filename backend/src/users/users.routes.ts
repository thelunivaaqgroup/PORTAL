import { Router } from "express";
import { prisma } from "../prisma.js";
import { validateEmailDomain } from "../env.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { writeAuditLog } from "../audit/audit.service.js";
import {
  createUser,
  changeUserRole,
  setUserActive,
  resetUserPassword,
  listUsers,
  isAssignableRole,
} from "./users.service.js";
import type { CreateUserBody, ChangeRoleBody, DeactivateBody, ResetPasswordBody } from "./users.types.js";

export const usersRouter = Router();

// All users routes require auth
usersRouter.use(requireAuth);

// GET /users — SUPER_ADMIN + ADMIN
usersRouter.get("/", requireRole("SUPER_ADMIN", "ADMIN"), async (req, res) => {
  const users = await listUsers(req.auth!.role);

  await writeAuditLog({
    actorUserId: req.auth!.userId,
    action: "USER_LIST_VIEWED",
    entityType: "user",
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: { count: users.length },
  });

  res.json({ users });
});

// POST /users — SUPER_ADMIN only
usersRouter.post("/", requireRole("SUPER_ADMIN"), async (req, res) => {
  const { email, fullName, role, tempPassword } = req.body as CreateUserBody;

  if (!email || !fullName || !role || !tempPassword) {
    res.status(400).json({ code: "VALIDATION", message: "email, fullName, role, tempPassword required" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  if (!validateEmailDomain(normalizedEmail)) {
    res.status(400).json({ code: "DOMAIN_REJECTED", message: "Email must be @thelunivaaqgroup.com" });
    return;
  }

  if (!isAssignableRole(role)) {
    res.status(400).json({ code: "INVALID_ROLE", message: "Role must be ADMIN, EDITOR, or VIEWER" });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    res.status(409).json({ code: "DUPLICATE", message: "User with this email already exists" });
    return;
  }

  if (tempPassword.length < 8) {
    res.status(400).json({ code: "VALIDATION", message: "Password must be at least 8 characters" });
    return;
  }

  const user = await createUser(normalizedEmail, fullName, role, tempPassword, req.auth!.userId);

  await writeAuditLog({
    actorUserId: req.auth!.userId,
    action: "USER_CREATED",
    entityType: "user",
    entityId: user.id,
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: { email: normalizedEmail, role },
  });

  res.status(201).json({
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, isActive: user.isActive },
  });
});

// PATCH /users/:id/role — SUPER_ADMIN only
usersRouter.patch("/:id/role", requireRole("SUPER_ADMIN"), async (req, res) => {
  const { role } = req.body as ChangeRoleBody;

  if (!role || !isAssignableRole(role)) {
    res.status(400).json({ code: "INVALID_ROLE", message: "Role must be ADMIN, EDITOR, or VIEWER" });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ code: "NOT_FOUND", message: "User not found" });
    return;
  }

  const oldRole = target.role;
  const updated = await changeUserRole(target.id, role);

  await writeAuditLog({
    actorUserId: req.auth!.userId,
    action: "USER_ROLE_CHANGED",
    entityType: "user",
    entityId: target.id,
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: { oldRole, newRole: role },
  });

  res.json({
    user: { id: updated.id, email: updated.email, fullName: updated.fullName, role: updated.role, isActive: updated.isActive },
  });
});

// PATCH /users/:id/deactivate — SUPER_ADMIN only
usersRouter.patch("/:id/deactivate", requireRole("SUPER_ADMIN"), async (req, res) => {
  const { isActive } = req.body as DeactivateBody;

  if (typeof isActive !== "boolean") {
    res.status(400).json({ code: "VALIDATION", message: "isActive (boolean) required" });
    return;
  }

  if (req.params.id === req.auth!.userId) {
    res.status(400).json({ code: "SELF_ACTION", message: "Cannot deactivate your own account" });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ code: "NOT_FOUND", message: "User not found" });
    return;
  }

  const updated = await setUserActive(target.id, isActive);

  await writeAuditLog({
    actorUserId: req.auth!.userId,
    action: "USER_ACTIVATION_CHANGED",
    entityType: "user",
    entityId: target.id,
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: { isActive },
  });

  res.json({
    user: { id: updated.id, email: updated.email, fullName: updated.fullName, role: updated.role, isActive: updated.isActive },
  });
});

// POST /users/:id/reset-password — SUPER_ADMIN only
usersRouter.post("/:id/reset-password", requireRole("SUPER_ADMIN"), async (req, res) => {
  const { newPassword } = req.body as ResetPasswordBody;

  if (!newPassword || newPassword.length < 8) {
    res.status(400).json({ code: "VALIDATION", message: "newPassword must be at least 8 characters" });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ code: "NOT_FOUND", message: "User not found" });
    return;
  }

  await resetUserPassword(target.id, newPassword);

  await writeAuditLog({
    actorUserId: req.auth!.userId,
    action: "USER_PASSWORD_RESET",
    entityType: "user",
    entityId: target.id,
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata: {},
  });

  res.json({ message: "Password reset successfully" });
});
