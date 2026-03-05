import type { Role } from "./permissions";

const hierarchy: Record<Role, Role[]> = {
  SUPER_ADMIN: ["SUPER_ADMIN", "ADMIN", "EDITOR", "VIEWER"],
  ADMIN: ["EDITOR", "VIEWER"],
  EDITOR: [],
  VIEWER: [],
};

export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  return hierarchy[actorRole].includes(targetRole);
}

export function getAssignableRoles(actorRole: Role): Role[] {
  return hierarchy[actorRole];
}
