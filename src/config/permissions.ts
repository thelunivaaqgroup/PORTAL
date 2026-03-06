export type Role = "SUPER_ADMIN" | "ADMIN" | "EDITOR" | "VIEWER";

export type Permission =
  | "dashboard:read"
  | "demo:read"
  | "demo:create"
  | "demo:delete"
  | "users:read"
  | "users:write"
  | "users:deactivate"
  | "password:reset"
  | "roles:assign"
  | "formulations:read"
  | "formulations:write"
  | "ingredients:read"
  | "ingredients:write"
  | "ingredients:delete"
  | "products:read"
  | "products:write"
  | "products:delete"
  | "ranges:read"
  | "ranges:write"
  | "ranges:delete"
  | "inventory:read"
  | "inventory:write"
  | "inventory:delete"
  | "manufacturing:approve"
  | "batches:read"
  | "batches:write"
  | "greenfield:read"
  | "greenfield:write"
  | "greenfield:convert"
  | "aicis:read"
  | "aicis:import"
  | "compliance:read"
  | "compliance:write"
  | "compliance:approve"
  | "audit:read";

export const ROLES: Role[] = ["SUPER_ADMIN", "ADMIN", "EDITOR", "VIEWER"];

export const rolePermissions: Record<Role, Permission[]> = {
  SUPER_ADMIN: [
    "dashboard:read",
    "demo:read",
    "demo:create",
    "demo:delete",
    "users:read",
    "users:write",
    "users:deactivate",
    "password:reset",
    "roles:assign",
    "formulations:read",
    "formulations:write",
    "ingredients:read",
    "ingredients:write",
    "ingredients:delete",
    "products:read",
    "products:write",
    "products:delete",
    "ranges:read",
    "ranges:write",
    "ranges:delete",
    "inventory:read",
    "inventory:write",
    "inventory:delete",
    "manufacturing:approve",
    "batches:read",
    "batches:write",
    "greenfield:read",
    "greenfield:write",
    "greenfield:convert",
    "aicis:read",
    "aicis:import",
    "compliance:read",
    "compliance:write",
    "compliance:approve",
    "audit:read",
  ],
  ADMIN: ["dashboard:read", "demo:read", "demo:create", "demo:delete", "users:read", "roles:assign", "formulations:read", "formulations:write", "ingredients:read", "ingredients:write", "products:read", "products:write", "ranges:read", "ranges:write", "inventory:read", "inventory:write", "manufacturing:approve", "batches:read", "batches:write", "greenfield:read", "greenfield:write", "greenfield:convert", "aicis:read", "aicis:import", "compliance:read", "compliance:write", "compliance:approve", "audit:read"],
  EDITOR: ["dashboard:read", "demo:read", "demo:create", "formulations:read", "ingredients:read", "products:read", "ranges:read", "batches:read", "greenfield:read", "aicis:read", "compliance:read"],
  VIEWER: ["dashboard:read", "demo:read", "formulations:read", "ingredients:read", "products:read", "ranges:read", "batches:read", "greenfield:read", "aicis:read", "compliance:read"],
};

export function getPermissionsForRole(role: Role): Permission[] {
  return rolePermissions[role];
}
