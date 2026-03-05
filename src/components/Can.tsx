import type { ReactNode } from "react";
import type { Permission } from "../config/permissions";
import { usePermissions } from "../context/usePermissions";

type CanProps = {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
};

export default function Can({ permission, children, fallback = null }: CanProps) {
  const { has } = usePermissions();

  if (!has(permission)) return <>{fallback}</>;

  return <>{children}</>;
}
