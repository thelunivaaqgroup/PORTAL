import { useMemo } from "react";
import { usePermissions } from "../../context/usePermissions";
import { getFlag } from "../../config/flags";
import { navGroups, type NavItem, type NavGroup } from "./navItems";

/** Returns nav groups filtered by permissions & feature flags. Empty groups are removed. */
export function useNavGroups(): NavGroup[] {
  const { has } = usePermissions();

  return useMemo(
    () =>
      navGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => {
            // disabled items always show (they're red "not required" placeholders)
            if (item.disabled) return true;
            if (item.permission && !has(item.permission)) return false;
            if (item.flag && !getFlag(item.flag)) return false;
            return true;
          }),
        }))
        .filter((group) => group.items.length > 0),
    [has],
  );
}

/** Flat filtered list — backward compat */
export function useNavItems(): NavItem[] {
  const groups = useNavGroups();
  return useMemo(() => groups.flatMap((g) => g.items), [groups]);
}
