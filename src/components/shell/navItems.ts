import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Bell,
  Lightbulb,
  Package,
  ShieldCheck,
  Warehouse,
  Factory,
  FlaskConical,
  Ban,
  TestTube2,
  Palette,
  Brain,
  ScrollText,
  Users,
} from "lucide-react";
import type { Permission } from "../../config/permissions";
import type { FeatureFlag } from "../../config/flags";

export type NavItem = {
  label: string;
  icon: LucideIcon;
  path: string;
  permission?: Permission;
  flag?: FeatureFlag;
  disabled?: boolean;
  badgeKey?: string;
};

export type NavGroup = {
  groupLabel: string;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    groupLabel: "OVERVIEW",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard", permission: "dashboard:read" },
      { label: "Alerts", icon: Bell, path: "/alerts", permission: "dashboard:read", badgeKey: "activeAlerts" },
    ],
  },
  {
    groupLabel: "PRODUCT LIFECYCLE",
    items: [
      { label: "Greenfield Ideas", icon: Lightbulb, path: "/greenfield", permission: "greenfield:read" },
      { label: "Products", icon: Package, path: "/products", permission: "products:read" },
      { label: "Compliance Hub", icon: ShieldCheck, path: "/compliance", permission: "compliance:read" },
    ],
  },
  {
    groupLabel: "SUPPLY CHAIN",
    items: [
      { label: "Inventory", icon: Warehouse, path: "/inventory/lots", permission: "inventory:read" },
      { label: "Manufacturing", icon: Factory, path: "#", disabled: true },
    ],
  },
  {
    groupLabel: "REGULATORY",
    items: [
      { label: "AICIS Inventory", icon: FlaskConical, path: "/regulatory/aicis", permission: "aicis:read" },
      { label: "Banned / Restricted", icon: Ban, path: "/banned-restricted/records/latest", permission: "aicis:read" },
    ],
  },
  {
    groupLabel: "NOT REQUIRED",
    items: [
      { label: "Testing & Quality", icon: TestTube2, path: "#", disabled: true },
      { label: "Creative Production", icon: Palette, path: "#", disabled: true },
      { label: "Brand Brain", icon: Brain, path: "#", disabled: true },
    ],
  },
  {
    groupLabel: "SYSTEM",
    items: [
      { label: "Audit Log", icon: ScrollText, path: "/audit", permission: "audit:read" },
      { label: "Users", icon: Users, path: "/users", permission: "users:read" },
    ],
  },
];

// Flat list for backward compatibility
export const navItems: NavItem[] = navGroups.flatMap((g) => g.items);
