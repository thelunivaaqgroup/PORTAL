import type { Permission } from "../../config/permissions";
import type { FeatureFlag } from "../../config/flags";

export type NavItem = {
  label: string;
  abbrev: string;
  path: string;
  permission?: Permission;
  flag?: FeatureFlag;
};

export const navItems: NavItem[] = [
  { label: "Dashboard", abbrev: "D", path: "/dashboard", permission: "dashboard:read" },
  { label: "Greenfield", abbrev: "GF", path: "/greenfield", permission: "greenfield:read" },
  { label: "Products", abbrev: "P", path: "/products", permission: "products:read" },
  { label: "Compliance", abbrev: "C", path: "/compliance", permission: "compliance:read" },
  { label: "Inventory", abbrev: "IV", path: "/inventory/lots", permission: "inventory:read" },
  { label: "AICIS Inventory", abbrev: "AI", path: "/regulatory/aicis", permission: "aicis:read" },
  { label: "Audit log", abbrev: "AL", path: "/audit", permission: "audit:read" },
  { label: "Users", abbrev: "U", path: "/users", permission: "users:read" },
];
