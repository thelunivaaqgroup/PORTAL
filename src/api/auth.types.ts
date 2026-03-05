import type { Role, Permission } from "../config/permissions";

export type User = {
  fullName: string;
  email: string;
  role: Role;
  permissions: Permission[];
};

export type AuthState = {
  isAuthenticated: boolean;
  user: User | null;
};

export type LoginPayload = {
  email: string;
  password: string;
};

/** Shape returned by POST /auth/login */
export type LoginApiResponse = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; fullName: string; role: string };
};

/** Shape returned by GET /auth/me */
export type MeApiResponse = {
  user: { userId: string; email: string; role: string };
};
