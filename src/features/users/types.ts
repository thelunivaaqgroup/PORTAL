import type { Role } from "../../config/permissions";

export type UserRow = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

export type CreateUserPayload = {
  email: string;
  fullName: string;
  role: Role;
  tempPassword: string;
};

export type UserApiRow = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};
