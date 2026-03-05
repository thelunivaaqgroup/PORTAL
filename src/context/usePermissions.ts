import { useMemo } from "react";
import type { Permission, Role } from "../config/permissions";
import { useAuth } from "./useAuth";

type PermissionHelpers = {
  role: Role | null;
  permissions: Permission[];
  has: (permission: Permission) => boolean;
  hasAny: (permissions: Permission[]) => boolean;
  hasAll: (permissions: Permission[]) => boolean;
};

export function usePermissions(): PermissionHelpers {
  const { user } = useAuth();

  return useMemo(() => {
    const perms = user?.permissions ?? [];
    const role = user?.role ?? null;
    return {
      role,
      permissions: perms,
      has: (p) => perms.includes(p),
      hasAny: (ps) => ps.some((p) => perms.includes(p)),
      hasAll: (ps) => ps.every((p) => perms.includes(p)),
    };
  }, [user]);
}
