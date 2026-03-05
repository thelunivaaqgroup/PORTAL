import { prisma } from "../prisma.js";
import { hashPassword } from "../auth/auth.service.js";
import type { Role } from "@prisma/client";

const ALLOWED_ASSIGN_ROLES: Role[] = ["ADMIN", "EDITOR", "VIEWER"];

export function isAssignableRole(role: string): role is Role {
  return ALLOWED_ASSIGN_ROLES.includes(role as Role);
}

export async function createUser(
  email: string,
  fullName: string,
  role: Role,
  tempPassword: string,
  createdByUserId: string,
) {
  const passwordHash = await hashPassword(tempPassword);
  return prisma.user.create({
    data: {
      email: email.toLowerCase().trim(),
      fullName,
      role,
      passwordHash,
      createdByUserId,
    },
  });
}

export async function changeUserRole(userId: string, role: Role) {
  return prisma.user.update({
    where: { id: userId },
    data: { role },
  });
}

export async function setUserActive(userId: string, isActive: boolean) {
  return prisma.user.update({
    where: { id: userId },
    data: { isActive },
  });
}

export async function resetUserPassword(userId: string, newPassword: string) {
  const passwordHash = await hashPassword(newPassword);
  return prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
}

export async function listUsers(actorRole: Role) {
  if (actorRole === "SUPER_ADMIN") {
    return prisma.user.findMany({
      select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true, lastLoginAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  // ADMIN sees self + EDITOR + VIEWER
  return prisma.user.findMany({
    where: { role: { in: ["ADMIN", "EDITOR", "VIEWER"] } },
    select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true, lastLoginAt: true },
    orderBy: { createdAt: "desc" },
  });
}
