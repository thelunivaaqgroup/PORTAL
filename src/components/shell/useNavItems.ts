import { useMemo } from "react";
import { usePermissions } from "../../context/usePermissions";
import { getFlag } from "../../config/flags";
import { navItems, type NavItem } from "./navItems";

export function useNavItems(): NavItem[] {
  const { has } = usePermissions();

  return useMemo(
    () =>
      navItems.filter((item) => {
        if (item.permission && !has(item.permission)) return false;
        if (item.flag && !getFlag(item.flag)) return false;
        return true;
      }),
    [has],
  );
}
