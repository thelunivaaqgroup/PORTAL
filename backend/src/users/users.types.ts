import type { Role } from "@prisma/client";

export type CreateUserBody = {
  email: string;
  fullName: string;
  role: Role;
  tempPassword: string;
};

export type ChangeRoleBody = {
  role: Role;
};

export type DeactivateBody = {
  isActive: boolean;
};

export type ResetPasswordBody = {
  newPassword: string;
};
